-- Editable direct offers:
-- 1) Persist target freelancer on direct-offer jobs.
-- 2) Expose current user's existing direct offer in freelancer directory.
-- 3) Reuse existing open direct offer for "Edit Offer" flow.

alter table public.jobs
  add column if not exists offer_freelancer_id uuid references public.profiles(id) on delete set null,
  add column if not exists is_direct_offer boolean not null default false;

-- Backfill existing direct-offer jobs created from make_direct_offer().
update public.jobs j
set
  offer_freelancer_id = n.user_id,
  is_direct_offer = true
from public.notifications n
where n.type = 'job_match'
  and n.data->>'offer_type' = 'direct'
  and n.data->>'job_id' = j.id::text
  and (j.offer_freelancer_id is null or j.is_direct_offer = false);

create index if not exists idx_jobs_offer_freelancer_status
  on public.jobs(offer_freelancer_id, status)
  where is_direct_offer = true;

drop function if exists public.list_freelancer_directory();

create function public.list_freelancer_directory()
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
  v_is_update boolean := false;
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

