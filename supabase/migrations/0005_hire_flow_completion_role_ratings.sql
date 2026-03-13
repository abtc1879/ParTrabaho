-- Hire flow updates:
-- 1) Hired freelancer cannot apply to other jobs while active.
-- 2) Accepted applicant immediately sets job to in_progress.
-- 3) Either participant can mark job finished; when both marked, job becomes completed.
-- 4) Separate ratings for client and freelancer roles.

alter table public.profiles
  add column if not exists freelancer_rating_avg numeric(2, 1) not null default 0,
  add column if not exists freelancer_rating_count integer not null default 0,
  add column if not exists client_rating_avg numeric(2, 1) not null default 0,
  add column if not exists client_rating_count integer not null default 0;

alter table public.reviews
  add column if not exists reviewee_role text check (reviewee_role in ('client', 'freelancer'));

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
  v_client_done boolean;
  v_freelancer_done boolean;
begin
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

  if auth.uid() = v_client_id then
    update public.job_completions
    set client_marked_done = true
    where job_id = p_job_id;
  else
    update public.job_completions
    set freelancer_marked_done = true
    where job_id = p_job_id;
  end if;

  select client_marked_done, freelancer_marked_done
  into v_client_done, v_freelancer_done
  from public.job_completions
  where job_id = p_job_id;

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
      where id in (v_client_id, v_freelancer_id);
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

drop policy if exists "Freelancer can apply to open jobs" on public.job_applications;

create policy "Freelancer can apply to open jobs"
on public.job_applications
for insert
to authenticated
with check (
  auth.uid() = freelancer_id
  and exists (
    select 1
    from public.jobs j
    where j.id = job_id
      and j.status = 'open'
  )
  and not exists (
    select 1
    from public.jobs j2
    join public.job_applications ja2 on ja2.id = j2.accepted_application_id
    where ja2.freelancer_id = auth.uid()
      and j2.status in ('assigned', 'in_progress')
  )
);
