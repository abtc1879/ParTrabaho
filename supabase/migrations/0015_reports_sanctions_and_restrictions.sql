-- Reports + sanctions system:
-- 1st offense: 1 week suspension
-- 2nd offense: 1 month suspension
-- 3rd offense: 1 year suspension
-- 4th offense: blocked listed (permanent)
--
-- Also:
-- - Prevent duplicate profile names.
-- - Restrict key write actions for suspended/blocked users.

alter table public.profiles
  add column if not exists offense_count integer not null default 0,
  add column if not exists suspended_until timestamptz,
  add column if not exists blocked_listed boolean not null default false;

create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  reason_type text not null check (reason_type in ('poor_work', 'salary_issue', 'no_show', 'fraud', 'abuse', 'other')),
  reason_details text not null,
  status text not null default 'submitted' check (status in ('submitted', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (reporter_id, reported_user_id, job_id)
);

create index if not exists idx_user_reports_reported_created
  on public.user_reports(reported_user_id, created_at desc);

create index if not exists idx_user_reports_reporter_created
  on public.user_reports(reporter_id, created_at desc);

create or replace function public.normalize_profile_name(
  p_surname text,
  p_firstname text,
  p_middlename text,
  p_suffix text
)
returns text
language sql
immutable
as $$
  select lower(
    regexp_replace(
      trim(concat_ws(' ',
        coalesce(p_surname, ''),
        coalesce(p_firstname, ''),
        coalesce(p_middlename, ''),
        coalesce(p_suffix, '')
      )),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

create or replace function public.ensure_unique_profile_name()
returns trigger
language plpgsql
as $$
declare
  v_new_name text;
begin
  v_new_name := public.normalize_profile_name(new.surname, new.firstname, new.middlename, new.suffix);

  if coalesce(v_new_name, '') = '' then
    raise exception 'Name is required';
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and public.normalize_profile_name(p.surname, p.firstname, p.middlename, p.suffix) = v_new_name
  ) then
    raise exception 'A profile with the same name already exists';
  end if;

  return new;
end;
$$;

drop trigger if exists trig_ensure_unique_profile_name on public.profiles;
create trigger trig_ensure_unique_profile_name
before insert or update of surname, firstname, middlename, suffix
on public.profiles
for each row
execute function public.ensure_unique_profile_name();

create or replace function public.is_user_restricted(p_user_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and (
        p.blocked_listed = true
        or (p.suspended_until is not null and p.suspended_until > now())
      )
  );
$$;

create or replace function public.assert_user_not_restricted(p_user_id uuid default auth.uid())
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_blocked boolean;
  v_suspended_until timestamptz;
begin
  select p.blocked_listed, p.suspended_until
  into v_blocked, v_suspended_until
  from public.profiles p
  where p.id = p_user_id;

  if coalesce(v_blocked, false) then
    raise exception 'Account is blocked listed due to repeated offenses.';
  end if;

  if v_suspended_until is not null and v_suspended_until > now() then
    raise exception 'Account is suspended until %.', to_char(v_suspended_until, 'YYYY-MM-DD HH24:MI:SS');
  end if;
end;
$$;

grant execute on function public.assert_user_not_restricted(uuid) to authenticated;
grant execute on function public.is_user_restricted(uuid) to authenticated;

create or replace function public.apply_sanction_for_reported_user(p_reported_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offense_count integer;
  v_suspended_until timestamptz;
  v_blocked boolean := false;
begin
  select count(*)::integer
  into v_offense_count
  from public.user_reports r
  where r.reported_user_id = p_reported_user_id
    and r.status = 'submitted';

  if v_offense_count >= 4 then
    v_blocked := true;
    v_suspended_until := null;
  elsif v_offense_count = 3 then
    v_suspended_until := now() + interval '1 year';
  elsif v_offense_count = 2 then
    v_suspended_until := now() + interval '1 month';
  elsif v_offense_count = 1 then
    v_suspended_until := now() + interval '1 week';
  else
    v_suspended_until := null;
  end if;

  update public.profiles
  set offense_count = v_offense_count,
      suspended_until = v_suspended_until,
      blocked_listed = v_blocked
  where id = p_reported_user_id;
end;
$$;

grant execute on function public.apply_sanction_for_reported_user(uuid) to authenticated;

create or replace function public.trig_user_report_apply_sanction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.apply_sanction_for_reported_user(new.reported_user_id);
  return new;
end;
$$;

drop trigger if exists trig_user_report_apply_sanction on public.user_reports;
create trigger trig_user_report_apply_sanction
after insert on public.user_reports
for each row
execute function public.trig_user_report_apply_sanction();

create or replace function public.submit_user_report(
  p_reported_user_id uuid,
  p_job_id uuid,
  p_reason_type text,
  p_reason_details text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reporter_id uuid;
  v_client_id uuid;
  v_freelancer_id uuid;
  v_report_id uuid;
begin
  v_reporter_id := auth.uid();

  if v_reporter_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.assert_user_not_restricted(v_reporter_id);

  if p_reported_user_id is null or p_job_id is null then
    raise exception 'Reported user and job are required';
  end if;

  if p_reported_user_id = v_reporter_id then
    raise exception 'You cannot report yourself';
  end if;

  if p_reason_type not in ('poor_work', 'salary_issue', 'no_show', 'fraud', 'abuse', 'other') then
    raise exception 'Invalid report reason';
  end if;

  if coalesce(trim(p_reason_details), '') = '' then
    raise exception 'Please provide report details';
  end if;

  select j.client_id, ja.freelancer_id
  into v_client_id, v_freelancer_id
  from public.jobs j
  left join public.job_applications ja on ja.id = j.accepted_application_id
  where j.id = p_job_id;

  if v_client_id is null or v_freelancer_id is null then
    raise exception 'Only hired/completed jobs can be reported';
  end if;

  if v_reporter_id not in (v_client_id, v_freelancer_id) then
    raise exception 'You are not part of this job';
  end if;

  if p_reported_user_id not in (v_client_id, v_freelancer_id) then
    raise exception 'Reported user is not part of this job';
  end if;

  insert into public.user_reports (
    reporter_id,
    reported_user_id,
    job_id,
    reason_type,
    reason_details,
    status
  )
  values (
    v_reporter_id,
    p_reported_user_id,
    p_job_id,
    p_reason_type,
    trim(p_reason_details),
    'submitted'
  )
  returning id into v_report_id;

  return v_report_id;
end;
$$;

grant execute on function public.submit_user_report(uuid, uuid, text, text) to authenticated;

alter table public.user_reports enable row level security;

drop policy if exists "Users view own submitted or received reports" on public.user_reports;
create policy "Users view own submitted or received reports"
on public.user_reports
for select
to authenticated
using (auth.uid() = reporter_id or auth.uid() = reported_user_id);

drop policy if exists "Users can insert own reports" on public.user_reports;
create policy "Users can insert own reports"
on public.user_reports
for insert
to authenticated
with check (auth.uid() = reporter_id and reporter_id <> reported_user_id);

-- Restrict key write operations when account is suspended/blocked.
drop policy if exists "Restricted users cannot insert jobs" on public.jobs;
create policy "Restricted users cannot insert jobs"
on public.jobs
as restrictive
for insert
to authenticated
with check (not public.is_user_restricted(auth.uid()));

drop policy if exists "Restricted users cannot update jobs" on public.jobs;
create policy "Restricted users cannot update jobs"
on public.jobs
as restrictive
for update
to authenticated
using (not public.is_user_restricted(auth.uid()))
with check (not public.is_user_restricted(auth.uid()));

drop policy if exists "Restricted users cannot delete jobs" on public.jobs;
create policy "Restricted users cannot delete jobs"
on public.jobs
as restrictive
for delete
to authenticated
using (not public.is_user_restricted(auth.uid()));

drop policy if exists "Restricted users cannot insert applications" on public.job_applications;
create policy "Restricted users cannot insert applications"
on public.job_applications
as restrictive
for insert
to authenticated
with check (not public.is_user_restricted(auth.uid()));

drop policy if exists "Restricted users cannot update applications" on public.job_applications;
create policy "Restricted users cannot update applications"
on public.job_applications
as restrictive
for update
to authenticated
using (not public.is_user_restricted(auth.uid()))
with check (not public.is_user_restricted(auth.uid()));

drop policy if exists "Restricted users cannot insert messages" on public.messages;
create policy "Restricted users cannot insert messages"
on public.messages
as restrictive
for insert
to authenticated
with check (not public.is_user_restricted(auth.uid()));

drop policy if exists "Restricted users cannot insert conversations" on public.conversations;
create policy "Restricted users cannot insert conversations"
on public.conversations
as restrictive
for insert
to authenticated
with check (not public.is_user_restricted(auth.uid()));

drop policy if exists "Restricted users cannot delete conversations" on public.conversations;
create policy "Restricted users cannot delete conversations"
on public.conversations
as restrictive
for delete
to authenticated
using (not public.is_user_restricted(auth.uid()));

drop policy if exists "Restricted users cannot insert completions" on public.job_completions;
create policy "Restricted users cannot insert completions"
on public.job_completions
as restrictive
for insert
to authenticated
with check (not public.is_user_restricted(auth.uid()));

drop policy if exists "Restricted users cannot update completions" on public.job_completions;
create policy "Restricted users cannot update completions"
on public.job_completions
as restrictive
for update
to authenticated
using (not public.is_user_restricted(auth.uid()))
with check (not public.is_user_restricted(auth.uid()));

drop policy if exists "Restricted users cannot insert reviews" on public.reviews;
create policy "Restricted users cannot insert reviews"
on public.reviews
as restrictive
for insert
to authenticated
with check (not public.is_user_restricted(auth.uid()));

-- Replace key write RPCs to enforce suspension/block checks.
create or replace function public.accept_job_application(application_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
  v_client_id uuid;
  v_freelancer_id uuid;
begin
  perform public.assert_user_not_restricted(auth.uid());

  select ja.job_id, j.client_id, ja.freelancer_id
  into v_job_id, v_client_id, v_freelancer_id
  from public.job_applications ja
  join public.jobs j on j.id = ja.job_id
  where ja.id = application_id;

  if v_job_id is null then
    raise exception 'Application not found';
  end if;

  if auth.uid() is distinct from v_client_id then
    raise exception 'You are not allowed to hire this applicant';
  end if;

  if exists (
    select 1
    from public.jobs j
    where j.id = v_job_id
      and j.status <> 'open'
  ) then
    raise exception 'Job is no longer open';
  end if;

  if exists (
    select 1
    from public.jobs j2
    join public.job_applications ja2 on ja2.id = j2.accepted_application_id
    where ja2.freelancer_id = v_freelancer_id
      and j2.status in ('assigned', 'in_progress')
      and j2.id <> v_job_id
  ) then
    raise exception 'This applicant is already hired for an active job';
  end if;

  update public.job_applications
  set status = 'accepted'
  where id = application_id;

  update public.job_applications
  set status = 'rejected'
  where job_id = v_job_id
    and id <> application_id
    and status = 'pending';

  update public.jobs
  set status = 'in_progress',
      accepted_application_id = application_id
  where id = v_job_id;

  insert into public.conversations (job_id, client_id, freelancer_id)
  values (v_job_id, v_client_id, v_freelancer_id)
  on conflict (job_id) do nothing;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_freelancer_id,
    'application_accepted',
    'You are Hired',
    'Your application has been accepted. Job is now in progress and chat is open.',
    jsonb_build_object('job_id', v_job_id)
  );

  return v_job_id;
end;
$$;

grant execute on function public.accept_job_application(uuid) to authenticated;

create or replace function public.mark_job_finished(p_job_id uuid)
returns public.job_status_t
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_freelancer_id uuid;
  v_prev_status public.job_status_t;
  v_prev_client_done boolean;
  v_prev_freelancer_done boolean;
  v_client_done boolean;
  v_freelancer_done boolean;
  v_actor_name text;
  v_notify_user_id uuid;
begin
  perform public.assert_user_not_restricted(auth.uid());

  select j.client_id, ja.freelancer_id, j.status
  into v_client_id, v_freelancer_id, v_prev_status
  from public.jobs j
  left join public.job_applications ja on ja.id = j.accepted_application_id
  where j.id = p_job_id;

  if v_client_id is null or v_freelancer_id is null then
    raise exception 'Job is not yet hired';
  end if;

  if auth.uid() not in (v_client_id, v_freelancer_id) then
    raise exception 'You are not allowed to finish this job';
  end if;

  if v_prev_status not in ('assigned', 'in_progress', 'completed') then
    raise exception 'Job is not active';
  end if;

  insert into public.job_completions (job_id)
  values (p_job_id)
  on conflict (job_id) do nothing;

  select client_marked_done, freelancer_marked_done
  into v_prev_client_done, v_prev_freelancer_done
  from public.job_completions
  where job_id = p_job_id;

  if auth.uid() = v_client_id then
    update public.job_completions
    set client_marked_done = true
    where job_id = p_job_id;
    v_notify_user_id := v_freelancer_id;
  else
    update public.job_completions
    set freelancer_marked_done = true
    where job_id = p_job_id;
    v_notify_user_id := v_client_id;
  end if;

  select client_marked_done, freelancer_marked_done
  into v_client_done, v_freelancer_done
  from public.job_completions
  where job_id = p_job_id;

  if auth.uid() = v_client_id and not coalesce(v_prev_client_done, false) then
    select concat_ws(' ', firstname, surname)
    into v_actor_name
    from public.profiles
    where id = v_client_id;

    insert into public.notifications (user_id, type, title, body, data)
    values (
      v_notify_user_id,
      'job_completed',
      'Job Finish Update',
      coalesce(nullif(v_actor_name, ''), 'Client') || ' marked the job as finished.',
      jsonb_build_object('job_id', p_job_id, 'marker_id', v_client_id, 'marker_role', 'client')
    );
  elsif auth.uid() = v_freelancer_id and not coalesce(v_prev_freelancer_done, false) then
    select concat_ws(' ', firstname, surname)
    into v_actor_name
    from public.profiles
    where id = v_freelancer_id;

    insert into public.notifications (user_id, type, title, body, data)
    values (
      v_notify_user_id,
      'job_completed',
      'Job Finish Update',
      coalesce(nullif(v_actor_name, ''), 'Freelancer') || ' marked the job as finished.',
      jsonb_build_object('job_id', p_job_id, 'marker_id', v_freelancer_id, 'marker_role', 'freelancer')
    );
  end if;

  if coalesce(v_client_done, false) and coalesce(v_freelancer_done, false) then
    update public.job_completions
    set completed_at = coalesce(completed_at, now())
    where job_id = p_job_id;

    if v_prev_status <> 'completed' then
      update public.jobs
      set status = 'completed'
      where id = p_job_id;

      update public.profiles
      set jobs_completed_count = jobs_completed_count + 1
      where id = v_freelancer_id;
    end if;
  else
    update public.jobs
    set status = 'in_progress'
    where id = p_job_id
      and status = 'assigned';
  end if;

  return (
    select status
    from public.jobs
    where id = p_job_id
  );
end;
$$;

grant execute on function public.mark_job_finished(uuid) to authenticated;

create or replace function public.submit_job_review(
  p_job_id uuid,
  p_reviewee_id uuid,
  p_stars integer,
  p_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_freelancer_id uuid;
  v_reviewer_id uuid;
  v_reviewee_role text;
  v_review_id uuid;
begin
  v_reviewer_id := auth.uid();
  perform public.assert_user_not_restricted(v_reviewer_id);

  if p_stars < 1 or p_stars > 5 then
    raise exception 'Stars must be between 1 and 5';
  end if;

  select j.client_id, ja.freelancer_id
  into v_client_id, v_freelancer_id
  from public.jobs j
  left join public.job_applications ja on ja.id = j.accepted_application_id
  where j.id = p_job_id
    and j.status = 'completed';

  if v_client_id is null or v_freelancer_id is null then
    raise exception 'Job must be completed before rating';
  end if;

  if v_reviewer_id not in (v_client_id, v_freelancer_id) then
    raise exception 'You are not a participant in this job';
  end if;

  if p_reviewee_id not in (v_client_id, v_freelancer_id) then
    raise exception 'Invalid review target';
  end if;

  if p_reviewee_id = v_reviewer_id then
    raise exception 'You cannot rate yourself';
  end if;

  if exists (
    select 1
    from public.reviews r
    where r.job_id = p_job_id
      and r.reviewer_id = v_reviewer_id
      and r.reviewee_id = p_reviewee_id
  ) then
    raise exception 'You already submitted your rating for this user on this job';
  end if;

  v_reviewee_role := case
    when p_reviewee_id = v_client_id then 'client'
    else 'freelancer'
  end;

  insert into public.reviews (job_id, reviewer_id, reviewee_id, reviewee_role, stars, comment)
  values (p_job_id, v_reviewer_id, p_reviewee_id, v_reviewee_role, p_stars, p_comment)
  returning id into v_review_id;

  update public.profiles
  set rating_count = rating_count + 1,
      rating_avg = round(((rating_avg * rating_count + p_stars)::numeric / (rating_count + 1)), 1)
  where id = p_reviewee_id;

  if v_reviewee_role = 'client' then
    update public.profiles
    set client_rating_count = client_rating_count + 1,
        client_rating_avg = round(((client_rating_avg * client_rating_count + p_stars)::numeric / (client_rating_count + 1)), 1)
    where id = p_reviewee_id;
  else
    update public.profiles
    set freelancer_rating_count = freelancer_rating_count + 1,
        freelancer_rating_avg = round(((freelancer_rating_avg * freelancer_rating_count + p_stars)::numeric / (freelancer_rating_count + 1)), 1)
    where id = p_reviewee_id;
  end if;

  return v_review_id;
end;
$$;

grant execute on function public.submit_job_review(uuid, uuid, integer, text) to authenticated;

create or replace function public.make_direct_offer(
  p_freelancer_id uuid,
  p_description text,
  p_salary_php numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_client_name text;
  v_client_address text;
  v_skill text;
  v_job_id uuid;
  v_is_update boolean := false;
begin
  v_client_id := auth.uid();
  perform public.assert_user_not_restricted(v_client_id);

  if v_client_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_freelancer_id is null then
    raise exception 'Freelancer is required';
  end if;

  if p_freelancer_id = v_client_id then
    raise exception 'You cannot send an offer to yourself';
  end if;

  if coalesce(trim(p_description), '') = '' then
    raise exception 'Job description is required';
  end if;

  if p_salary_php is null or p_salary_php <= 0 then
    raise exception 'Salary must be greater than zero';
  end if;

  if not exists (select 1 from public.profiles where id = p_freelancer_id) then
    raise exception 'Freelancer profile not found';
  end if;

  select
    concat_ws(' ', firstname, surname),
    address
  into v_client_name, v_client_address
  from public.profiles
  where id = v_client_id;

  select expertise[1]
  into v_skill
  from public.profiles
  where id = p_freelancer_id;

  select j.id
  into v_job_id
  from public.jobs j
  where j.client_id = v_client_id
    and j.offer_freelancer_id = p_freelancer_id
    and j.is_direct_offer = true
    and j.status = 'open'
  order by j.created_at desc
  limit 1
  for update;

  if v_job_id is null then
    insert into public.jobs (
      client_id,
      title,
      description,
      required_skill,
      category,
      salary_php,
      location,
      status,
      offer_freelancer_id,
      is_direct_offer
    )
    values (
      v_client_id,
      'Direct Offer',
      p_description,
      coalesce(nullif(v_skill, ''), 'General Service'),
      'Others',
      p_salary_php,
      coalesce(nullif(v_client_address, ''), 'To be discussed'),
      'open',
      p_freelancer_id,
      true
    )
    returning id into v_job_id;
  else
    v_is_update := true;

    update public.jobs
    set
      description = p_description,
      salary_php = p_salary_php,
      required_skill = coalesce(nullif(v_skill, ''), required_skill),
      location = coalesce(nullif(v_client_address, ''), location),
      updated_at = now()
    where id = v_job_id;
  end if;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    p_freelancer_id,
    'job_match',
    case when v_is_update then 'Direct Offer Updated' else 'New Direct Offer' end,
    coalesce(nullif(v_client_name, ''), 'A client') || ' sent you a direct offer.',
    jsonb_build_object(
      'job_id', v_job_id,
      'client_id', v_client_id,
      'offer_description', p_description,
      'offer_salary_php', p_salary_php,
      'offer_type', 'direct'
    )
  );

  return v_job_id;
end;
$$;

grant execute on function public.make_direct_offer(uuid, text, numeric) to authenticated;

create or replace function public.respond_direct_offer(
  p_job_id uuid,
  p_action text
)
returns public.job_status_t
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_freelancer_id uuid;
  v_is_direct_offer boolean;
  v_status public.job_status_t;
  v_application_id uuid;
begin
  perform public.assert_user_not_restricted(auth.uid());

  if p_action not in ('accept', 'decline') then
    raise exception 'Invalid action';
  end if;

  select
    j.client_id,
    j.offer_freelancer_id,
    j.is_direct_offer,
    j.status
  into
    v_client_id,
    v_freelancer_id,
    v_is_direct_offer,
    v_status
  from public.jobs j
  where j.id = p_job_id;

  if v_client_id is null then
    raise exception 'Job not found';
  end if;

  if v_is_direct_offer is distinct from true then
    raise exception 'This job is not a direct offer';
  end if;

  if auth.uid() is distinct from v_freelancer_id then
    raise exception 'You are not allowed to respond to this offer';
  end if;

  if v_status <> 'open' then
    return v_status;
  end if;

  if p_action = 'accept' then
    if public.freelancer_has_active_hire(v_freelancer_id) then
      raise exception 'You already have an active hired job';
    end if;

    insert into public.job_applications (job_id, freelancer_id, cover_letter, status)
    values (p_job_id, v_freelancer_id, 'Accepted direct offer', 'accepted')
    on conflict (job_id, freelancer_id)
    do update set status = 'accepted', updated_at = now()
    returning id into v_application_id;

    update public.job_applications
    set status = 'rejected', updated_at = now()
    where job_id = p_job_id
      and id <> v_application_id
      and status = 'pending';

    update public.jobs
    set status = 'in_progress',
        accepted_application_id = v_application_id
    where id = p_job_id;

    insert into public.conversations (job_id, client_id, freelancer_id)
    values (p_job_id, v_client_id, v_freelancer_id)
    on conflict (job_id) do nothing;

    insert into public.notifications (user_id, type, title, body, data)
    values (
      v_client_id,
      'application_accepted',
      'Direct Offer Accepted',
      'Your direct offer has been accepted.',
      jsonb_build_object('job_id', p_job_id, 'freelancer_id', v_freelancer_id, 'offer_type', 'direct')
    );
  else
    update public.jobs
    set status = 'cancelled'
    where id = p_job_id;

    insert into public.notifications (user_id, type, title, body, data)
    values (
      v_client_id,
      'job_match',
      'Direct Offer Declined',
      'Your direct offer was declined by the freelancer.',
      jsonb_build_object('job_id', p_job_id, 'freelancer_id', v_freelancer_id, 'offer_type', 'direct')
    );
  end if;

  return (
    select status
    from public.jobs
    where id = p_job_id
  );
end;
$$;

grant execute on function public.respond_direct_offer(uuid, text) to authenticated;

-- Hide suspended/blocked users from Find Person directory.
create or replace function public.list_freelancer_directory()
returns table (
  id uuid,
  firstname text,
  middlename text,
  surname text,
  suffix text,
  expertise text[],
  address text,
  avatar_url text,
  freelancer_rating_avg numeric,
  freelancer_rating_count integer,
  rating_avg numeric,
  rating_count integer,
  is_currently_hired boolean,
  has_direct_offer boolean,
  offer_job_id uuid,
  offer_description text,
  offer_salary_php numeric
)
language sql
security definer
set search_path = public
as $$
  with directory as (
    select
      p.id,
      p.firstname,
      p.middlename,
      p.surname,
      p.suffix,
      p.expertise,
      p.address,
      p.avatar_url,
      p.freelancer_rating_avg,
      p.freelancer_rating_count,
      p.rating_avg,
      p.rating_count,
      exists (
        select 1
        from public.jobs jh
        join public.job_applications ja on ja.id = jh.accepted_application_id
        where ja.freelancer_id = p.id
          and jh.status in ('assigned', 'in_progress')
      ) as is_currently_hired,
      (offer.id is not null) as has_direct_offer,
      offer.id as offer_job_id,
      offer.description as offer_description,
      offer.salary_php as offer_salary_php
    from public.profiles p
    left join lateral (
      select j.id, j.description, j.salary_php
      from public.jobs j
      where j.client_id = auth.uid()
        and j.offer_freelancer_id = p.id
        and j.is_direct_offer = true
        and j.status = 'open'
      order by j.created_at desc
      limit 1
    ) offer on true
    where coalesce(p.blocked_listed, false) = false
      and (p.suspended_until is null or p.suspended_until <= now())
  )
  select *
  from directory
  where not is_currently_hired
  order by
    coalesce(freelancer_rating_avg, rating_avg, 0) desc,
    rating_count desc nulls last,
    id;
$$;

grant execute on function public.list_freelancer_directory() to authenticated;

