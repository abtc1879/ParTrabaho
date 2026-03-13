-- Direct offer response flow:
-- Freelancer can accept/decline a direct offer from chat.

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

