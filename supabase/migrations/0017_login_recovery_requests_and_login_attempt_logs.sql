-- Public login-credential recovery requests + login-attempt logs for admin review.

create table if not exists public.login_attempt_logs (
  id uuid primary key default gen_random_uuid(),
  attempted_email text not null,
  success boolean not null default false,
  failure_message text,
  user_agent text,
  attempted_at timestamptz not null default now()
);

create index if not exists idx_login_attempt_logs_email_attempted
  on public.login_attempt_logs ((lower(trim(attempted_email))), attempted_at desc);

create index if not exists idx_login_attempt_logs_success_attempted
  on public.login_attempt_logs (success, attempted_at desc);

create table if not exists public.login_recovery_requests (
  id uuid primary key default gen_random_uuid(),
  requester_name text not null,
  requester_email text not null,
  requester_phone text not null,
  reason_details text not null,
  linked_profile_id uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_response text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_login_recovery_requests_email_created
  on public.login_recovery_requests ((lower(trim(requester_email))), created_at desc);

create index if not exists idx_login_recovery_requests_status_created
  on public.login_recovery_requests (status, created_at desc);

create unique index if not exists idx_login_recovery_requests_pending_unique
  on public.login_recovery_requests ((lower(trim(requester_email))))
  where status = 'pending';

create or replace function public.log_login_attempt(
  p_attempted_email text,
  p_success boolean,
  p_failure_message text default null,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_email text;
begin
  v_email := lower(trim(coalesce(p_attempted_email, '')));

  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'Valid email is required';
  end if;

  insert into public.login_attempt_logs (
    attempted_email,
    success,
    failure_message,
    user_agent
  )
  values (
    v_email,
    coalesce(p_success, false),
    case when coalesce(p_success, false) then null else nullif(trim(coalesce(p_failure_message, '')), '') end,
    nullif(trim(coalesce(p_user_agent, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.log_login_attempt(text, boolean, text, text) to anon, authenticated;

create or replace function public.submit_login_recovery_request(
  p_requester_name text,
  p_requester_email text,
  p_requester_phone text,
  p_reason_details text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id uuid;
  v_name text;
  v_email text;
  v_phone text;
  v_reason text;
  v_linked_profile_id uuid;
begin
  v_name := trim(coalesce(p_requester_name, ''));
  v_email := lower(trim(coalesce(p_requester_email, '')));
  v_phone := trim(coalesce(p_requester_phone, ''));
  v_reason := trim(coalesce(p_reason_details, ''));

  if v_name = '' then
    raise exception 'Name is required';
  end if;

  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'Valid email is required';
  end if;

  if v_phone = '' then
    raise exception 'Phone number is required';
  end if;

  if v_reason = '' then
    raise exception 'Reason is required';
  end if;

  select p.id
  into v_linked_profile_id
  from auth.users u
  join public.profiles p on p.id = u.id
  where lower(u.email) = v_email
  order by p.created_at asc nulls last
  limit 1;

  insert into public.login_recovery_requests (
    requester_name,
    requester_email,
    requester_phone,
    reason_details,
    linked_profile_id,
    status
  )
  values (
    v_name,
    v_email,
    v_phone,
    v_reason,
    v_linked_profile_id,
    'pending'
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.submit_login_recovery_request(text, text, text, text) to anon, authenticated;

create or replace function public.admin_review_login_recovery_request(
  p_request_id uuid,
  p_decision text,
  p_admin_response text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin_user(auth.uid());

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid decision';
  end if;

  update public.login_recovery_requests
  set status = p_decision,
      admin_response = nullif(trim(coalesce(p_admin_response, '')), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_request_id
    and status = 'pending';

  if not found then
    raise exception 'Recovery request not found or already reviewed';
  end if;

  return p_request_id;
end;
$$;

grant execute on function public.admin_review_login_recovery_request(uuid, text, text) to authenticated;

create or replace function public.list_login_attempt_summary_for_admin()
returns table (
  attempted_email text,
  failed_attempts integer,
  successful_attempts integer,
  total_attempts integer,
  last_failed_at timestamptz,
  last_success_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_admin_user(auth.uid());

  return query
  select
    lower(trim(l.attempted_email)) as attempted_email,
    count(*) filter (where l.success = false)::integer as failed_attempts,
    count(*) filter (where l.success = true)::integer as successful_attempts,
    count(*)::integer as total_attempts,
    max(l.attempted_at) filter (where l.success = false) as last_failed_at,
    max(l.attempted_at) filter (where l.success = true) as last_success_at
  from public.login_attempt_logs l
  group by lower(trim(l.attempted_email))
  order by failed_attempts desc, last_failed_at desc nulls last;
end;
$$;

grant execute on function public.list_login_attempt_summary_for_admin() to authenticated;

create or replace function public.list_login_attempt_logs_for_admin(
  p_attempted_email text default null,
  p_limit integer default 40
)
returns table (
  id uuid,
  attempted_email text,
  success boolean,
  failure_message text,
  user_agent text,
  attempted_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_limit integer;
begin
  perform public.assert_admin_user(auth.uid());

  v_email := nullif(lower(trim(coalesce(p_attempted_email, ''))), '');
  v_limit := greatest(1, least(coalesce(p_limit, 40), 300));

  return query
  select
    l.id,
    l.attempted_email,
    l.success,
    l.failure_message,
    l.user_agent,
    l.attempted_at
  from public.login_attempt_logs l
  where v_email is null
    or lower(trim(l.attempted_email)) = v_email
  order by l.attempted_at desc
  limit v_limit;
end;
$$;

grant execute on function public.list_login_attempt_logs_for_admin(text, integer) to authenticated;

alter table public.login_attempt_logs enable row level security;
alter table public.login_recovery_requests enable row level security;

drop policy if exists "Public can insert login attempt logs" on public.login_attempt_logs;
create policy "Public can insert login attempt logs"
on public.login_attempt_logs
for insert
to anon, authenticated
with check (true);

drop policy if exists "Admins can read login attempt logs" on public.login_attempt_logs;
create policy "Admins can read login attempt logs"
on public.login_attempt_logs
for select
to authenticated
using (public.is_admin_user(auth.uid()));

drop policy if exists "Public can submit login recovery requests" on public.login_recovery_requests;
create policy "Public can submit login recovery requests"
on public.login_recovery_requests
for insert
to anon, authenticated
with check (status = 'pending');

drop policy if exists "Admins can read login recovery requests" on public.login_recovery_requests;
create policy "Admins can read login recovery requests"
on public.login_recovery_requests
for select
to authenticated
using (public.is_admin_user(auth.uid()));

drop policy if exists "Admins can update login recovery requests" on public.login_recovery_requests;
create policy "Admins can update login recovery requests"
on public.login_recovery_requests
for update
to authenticated
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));
