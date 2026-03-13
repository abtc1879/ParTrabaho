-- Fix RLS recursion on job_applications insert policy.
-- Previous policy checked active hires by querying job_applications inside
-- the same table policy, which can trigger "infinite recursion detected".

create or replace function public.freelancer_has_active_hire(p_freelancer_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.jobs j
    join public.job_applications ja on ja.id = j.accepted_application_id
    where ja.freelancer_id = p_freelancer_id
      and j.status in ('assigned', 'in_progress')
  );
$$;

grant execute on function public.freelancer_has_active_hire(uuid) to authenticated;

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
  and not public.freelancer_has_active_hire(auth.uid())
);

