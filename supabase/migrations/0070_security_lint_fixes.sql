-- Security lint fixes: set immutable search_path + tighten login attempt insert policy.

create or replace function public.normalize_profile_name(
  p_surname text,
  p_firstname text,
  p_middlename text,
  p_suffix text
)
returns text
language sql
immutable
set search_path = public
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
set search_path = public
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

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.increment_jobs_posted_count()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.profiles
  set jobs_posted_count = jobs_posted_count + 1
  where id = new.client_id;
  return new;
end;
$$;

drop policy if exists "Public can insert login attempt logs" on public.login_attempt_logs;
create policy "Public can insert login attempt logs"
on public.login_attempt_logs
for insert
to anon, authenticated
with check (
  attempted_email = lower(trim(attempted_email))
  and attempted_email <> ''
  and position('@' in attempted_email) > 0
  and attempted_at >= now() - interval '5 minutes'
  and attempted_at <= now() + interval '5 minutes'
);
