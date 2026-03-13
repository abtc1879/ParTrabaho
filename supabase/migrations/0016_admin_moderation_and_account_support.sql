-- Admin moderation + account support workflow:
-- - Admin role for managing reports/users
-- - Recovery and appeal requests
-- - Admin ability to review reports, dismiss false reports, and lift restrictions

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- Seed one admin only when none exists yet.
update public.profiles p
set is_admin = true
where p.id = (
  select p2.id
  from public.profiles p2
  order by p2.created_at asc nulls last, p2.id asc
  limit 1
)
and not exists (
  select 1 from public.profiles px where px.is_admin = true
);

alter table public.user_reports
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

create table if not exists public.account_support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_type text not null check (request_type in ('recovery', 'appeal')),
  report_id uuid references public.user_reports(id) on delete set null,
  reason_details text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_response text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_account_support_requests_user_created
  on public.account_support_requests(user_id, created_at desc);

create index if not exists idx_account_support_requests_status_created
  on public.account_support_requests(status, created_at desc);

create unique index if not exists idx_account_support_appeal_pending_unique
  on public.account_support_requests(user_id, report_id)
  where request_type = 'appeal' and status = 'pending';

create or replace function public.is_admin_user(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.is_admin = true
  );
$$;

create or replace function public.assert_admin_user(p_user_id uuid default auth.uid())
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_user(p_user_id) then
    raise exception 'Admin access required';
  end if;
end;
$$;

grant execute on function public.is_admin_user(uuid) to authenticated;
grant execute on function public.assert_admin_user(uuid) to authenticated;

-- Offense count keeps submitted/resolved reports and ignores dismissed reports.
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
    and r.status in ('submitted', 'resolved');

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

create or replace function public.trig_user_report_reapply_sanction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.reported_user_id is not distinct from old.reported_user_id
      and new.status is not distinct from old.status then
      return new;
    end if;
  end if;

  perform public.apply_sanction_for_reported_user(new.reported_user_id);

  if tg_op = 'UPDATE' and old.reported_user_id is distinct from new.reported_user_id then
    perform public.apply_sanction_for_reported_user(old.reported_user_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trig_user_report_reapply_sanction on public.user_reports;
create trigger trig_user_report_reapply_sanction
after update of status, reported_user_id on public.user_reports
for each row
execute function public.trig_user_report_reapply_sanction();

create or replace function public.submit_account_support_request(
  p_request_type text,
  p_reason_details text,
  p_report_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_request_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_request_type not in ('recovery', 'appeal') then
    raise exception 'Invalid request type';
  end if;

  if coalesce(trim(p_reason_details), '') = '' then
    raise exception 'Please provide request details';
  end if;

  if p_request_type = 'appeal' then
    if p_report_id is null then
      raise exception 'Report is required for an appeal';
    end if;

    if not exists (
      select 1
      from public.user_reports r
      where r.id = p_report_id
        and r.reported_user_id = v_user_id
    ) then
      raise exception 'You can only appeal reports filed against your account';
    end if;
  else
    p_report_id := null;
  end if;

  if exists (
    select 1
    from public.account_support_requests x
    where x.user_id = v_user_id
      and x.request_type = p_request_type
      and x.status = 'pending'
      and (
        (p_report_id is null and x.report_id is null)
        or x.report_id = p_report_id
      )
  ) then
    raise exception 'You already have a pending % request', p_request_type;
  end if;

  insert into public.account_support_requests (
    user_id,
    request_type,
    report_id,
    reason_details,
    status
  )
  values (
    v_user_id,
    p_request_type,
    p_report_id,
    trim(p_reason_details),
    'pending'
  )
  returning id into v_request_id;

  return v_request_id;
end;
$$;

grant execute on function public.submit_account_support_request(text, text, uuid) to authenticated;

create or replace function public.admin_update_user_report(
  p_report_id uuid,
  p_status text,
  p_review_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reported_user_id uuid;
begin
  perform public.assert_admin_user(auth.uid());

  if p_status not in ('submitted', 'resolved', 'dismissed') then
    raise exception 'Invalid report status';
  end if;

  update public.user_reports
  set status = p_status,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = nullif(trim(coalesce(p_review_note, '')), '')
  where id = p_report_id
  returning reported_user_id into v_reported_user_id;

  if v_reported_user_id is null then
    raise exception 'Report not found';
  end if;

  perform public.apply_sanction_for_reported_user(v_reported_user_id);
  return p_report_id;
end;
$$;

grant execute on function public.admin_update_user_report(uuid, text, text) to authenticated;

create or replace function public.admin_lift_user_restriction(
  p_user_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin_user(auth.uid());

  update public.profiles
  set suspended_until = null,
      blocked_listed = false
  where id = p_user_id;

  if not found then
    raise exception 'User profile not found';
  end if;

  return p_user_id;
end;
$$;

grant execute on function public.admin_lift_user_restriction(uuid, text) to authenticated;

create or replace function public.admin_set_user_admin(
  p_user_id uuid,
  p_make_admin boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_count integer;
  v_target_is_admin boolean;
begin
  perform public.assert_admin_user(auth.uid());

  select is_admin
  into v_target_is_admin
  from public.profiles
  where id = p_user_id;

  if v_target_is_admin is null then
    raise exception 'User profile not found';
  end if;

  if p_make_admin = false and v_target_is_admin = true then
    select count(*)::integer
    into v_admin_count
    from public.profiles
    where is_admin = true;

    if v_admin_count <= 1 then
      raise exception 'Cannot remove the last administrator';
    end if;
  end if;

  update public.profiles
  set is_admin = p_make_admin
  where id = p_user_id;

  return p_user_id;
end;
$$;

grant execute on function public.admin_set_user_admin(uuid, boolean) to authenticated;

create or replace function public.admin_review_account_support_request(
  p_request_id uuid,
  p_decision text,
  p_admin_response text default null,
  p_lift_restriction boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.account_support_requests%rowtype;
begin
  perform public.assert_admin_user(auth.uid());

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid decision';
  end if;

  select *
  into v_request
  from public.account_support_requests
  where id = p_request_id;

  if v_request.id is null then
    raise exception 'Support request not found';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Support request has already been reviewed';
  end if;

  update public.account_support_requests
  set status = p_decision,
      admin_response = nullif(trim(coalesce(p_admin_response, '')), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_request_id;

  if p_decision = 'approved' then
    if v_request.request_type = 'appeal' and v_request.report_id is not null then
      update public.user_reports
      set status = 'dismissed',
          reviewed_by = auth.uid(),
          reviewed_at = now(),
          review_note = coalesce(
            nullif(trim(coalesce(p_admin_response, '')), ''),
            'Appeal approved by administrator'
          )
      where id = v_request.report_id
        and reported_user_id = v_request.user_id;

      perform public.apply_sanction_for_reported_user(v_request.user_id);
    end if;

    if v_request.request_type = 'recovery' or p_lift_restriction then
      update public.profiles
      set suspended_until = null,
          blocked_listed = false
      where id = v_request.user_id;
    end if;
  end if;

  return p_request_id;
end;
$$;

grant execute on function public.admin_review_account_support_request(uuid, text, text, boolean) to authenticated;

alter table public.account_support_requests enable row level security;

drop policy if exists "Users view own submitted or received reports" on public.user_reports;
create policy "Users view own submitted or received reports"
on public.user_reports
for select
to authenticated
using (
  auth.uid() = reporter_id
  or auth.uid() = reported_user_id
  or public.is_admin_user(auth.uid())
);

drop policy if exists "Admins can update reports" on public.user_reports;
create policy "Admins can update reports"
on public.user_reports
for update
to authenticated
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

drop policy if exists "Users view own support requests or admins" on public.account_support_requests;
create policy "Users view own support requests or admins"
on public.account_support_requests
for select
to authenticated
using (auth.uid() = user_id or public.is_admin_user(auth.uid()));

drop policy if exists "Users can insert own support requests" on public.account_support_requests;
create policy "Users can insert own support requests"
on public.account_support_requests
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Admins can update support requests" on public.account_support_requests;
create policy "Admins can update support requests"
on public.account_support_requests
for update
to authenticated
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));
