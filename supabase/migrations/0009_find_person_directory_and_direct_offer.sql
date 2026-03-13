-- Find Person support:
-- 1) Return freelancer directory with active-hire availability.
-- 2) Allow clients to send a direct offer (description + salary) to a freelancer.

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
  is_currently_hired boolean
)
language sql
security definer
set search_path = public
as $$
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
      from public.jobs j
      join public.job_applications ja on ja.id = j.accepted_application_id
      where ja.freelancer_id = p.id
        and j.status in ('assigned', 'in_progress')
    ) as is_currently_hired
  from public.profiles p
  order by
    is_currently_hired asc,
    coalesce(p.freelancer_rating_avg, p.rating_avg, 0) desc,
    p.rating_count desc nulls last,
    p.created_at desc;
$$;

grant execute on function public.list_freelancer_directory() to authenticated;

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
begin
  v_client_id := auth.uid();

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

  insert into public.jobs (
    client_id,
    title,
    description,
    required_skill,
    category,
    salary_php,
    location,
    status
  )
  values (
    v_client_id,
    'Direct Offer',
    p_description,
    coalesce(nullif(v_skill, ''), 'General Service'),
    'Others',
    p_salary_php,
    coalesce(nullif(v_client_address, ''), 'To be discussed'),
    'open'
  )
  returning id into v_job_id;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    p_freelancer_id,
    'job_match',
    'New Direct Offer',
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

