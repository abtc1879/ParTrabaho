-- Hide freelancers with active jobs from Find Person directory.
-- Active means the freelancer is tied to a job with status assigned/in_progress.

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

