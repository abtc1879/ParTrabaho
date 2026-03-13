-- Allow clients to edit a specific direct offer by job id.

create or replace function public.update_direct_offer(
  p_job_id uuid,
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
  v_freelancer_id uuid;
  v_is_direct_offer boolean;
  v_status public.job_status_t;
  v_client_name text;
begin
  v_client_id := auth.uid();
  perform public.assert_user_not_restricted(v_client_id);

  if v_client_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_job_id is null then
    raise exception 'Job is required';
  end if;

  if coalesce(trim(p_description), '') = '' then
    raise exception 'Job description is required';
  end if;

  if p_salary_php is null or p_salary_php <= 0 then
    raise exception 'Salary must be greater than zero';
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

  if v_client_id is distinct from auth.uid() then
    raise exception 'You are not allowed to edit this offer';
  end if;

  if v_is_direct_offer is distinct from true then
    raise exception 'This job is not a direct offer';
  end if;

  if v_status <> 'open' then
    raise exception 'Only open direct offers can be edited';
  end if;

  if v_freelancer_id is null then
    raise exception 'Direct offer recipient not found';
  end if;

  update public.jobs
  set
    description = p_description,
    salary_php = p_salary_php,
    updated_at = now()
  where id = p_job_id;

  select concat_ws(' ', firstname, surname)
  into v_client_name
  from public.profiles
  where id = auth.uid();

  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_freelancer_id,
    'job_match',
    'Direct Offer Updated',
    coalesce(nullif(v_client_name, ''), 'A client') || ' updated a direct offer.',
    jsonb_build_object(
      'job_id', p_job_id,
      'client_id', auth.uid(),
      'offer_description', p_description,
      'offer_salary_php', p_salary_php,
      'offer_type', 'direct'
    )
  );

  return p_job_id;
end;
$$;

grant execute on function public.update_direct_offer(uuid, text, numeric) to authenticated;
