-- Notify the other participant whenever one side marks a job as finished.
-- Keeps freelancer-only jobs_completed_count logic from previous migration.

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
  v_prev_client_done boolean;
  v_prev_freelancer_done boolean;
  v_client_done boolean;
  v_freelancer_done boolean;
  v_actor_name text;
  v_notify_user_id uuid;
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

  select client_marked_done, freelancer_marked_done
  into v_prev_client_done, v_prev_freelancer_done
  from public.job_completions
  where job_id = p_job_id;

  if auth.uid() = v_client_id then
    update public.job_completions
    set client_marked_done = true
    where job_id = p_job_id;
    v_notify_user_id := v_freelancer_id;
  else
    update public.job_completions
    set freelancer_marked_done = true
    where job_id = p_job_id;
    v_notify_user_id := v_client_id;
  end if;

  select client_marked_done, freelancer_marked_done
  into v_client_done, v_freelancer_done
  from public.job_completions
  where job_id = p_job_id;

  -- Notify the other participant only when this call marks their counterpart flag for the first time.
  if auth.uid() = v_client_id and not coalesce(v_prev_client_done, false) then
    select concat_ws(' ', firstname, surname)
    into v_actor_name
    from public.profiles
    where id = v_client_id;

    insert into public.notifications (user_id, type, title, body, data)
    values (
      v_notify_user_id,
      'job_completed',
      'Job Finish Update',
      coalesce(nullif(v_actor_name, ''), 'Client') || ' marked the job as finished.',
      jsonb_build_object('job_id', p_job_id, 'marker_id', v_client_id, 'marker_role', 'client')
    );
  elsif auth.uid() = v_freelancer_id and not coalesce(v_prev_freelancer_done, false) then
    select concat_ws(' ', firstname, surname)
    into v_actor_name
    from public.profiles
    where id = v_freelancer_id;

    insert into public.notifications (user_id, type, title, body, data)
    values (
      v_notify_user_id,
      'job_completed',
      'Job Finish Update',
      coalesce(nullif(v_actor_name, ''), 'Freelancer') || ' marked the job as finished.',
      jsonb_build_object('job_id', p_job_id, 'marker_id', v_freelancer_id, 'marker_role', 'freelancer')
    );
  end if;

  if coalesce(v_client_done, false) and coalesce(v_freelancer_done, false) then
    update public.job_completions
    set completed_at = coalesce(completed_at, now())
    where job_id = p_job_id;

    if v_prev_status <> 'completed' then
      update public.jobs
      set status = 'completed'
      where id = p_job_id;

      -- Count completion only for the freelancer who did the work.
      update public.profiles
      set jobs_completed_count = jobs_completed_count + 1
      where id = v_freelancer_id;
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

