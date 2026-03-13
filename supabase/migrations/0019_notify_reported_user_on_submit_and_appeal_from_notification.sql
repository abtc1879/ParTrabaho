-- Notify reported users immediately when a report is submitted.
-- Include reason details in the notification payload so the user can appeal.

alter type public.notification_type_t
  add value if not exists 'report_update';

create or replace function public.submit_user_report(
  p_reported_user_id uuid,
  p_job_id uuid,
  p_reason_type text,
  p_reason_details text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reporter_id uuid;
  v_client_id uuid;
  v_freelancer_id uuid;
  v_report_id uuid;
  v_reporter_name text;
  v_reason_details text;
  v_reason_label text;
begin
  v_reporter_id := auth.uid();

  if v_reporter_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.assert_user_not_restricted(v_reporter_id);

  if p_reported_user_id is null or p_job_id is null then
    raise exception 'Reported user and job are required';
  end if;

  if p_reported_user_id = v_reporter_id then
    raise exception 'You cannot report yourself';
  end if;

  if p_reason_type not in ('poor_work', 'salary_issue', 'no_show', 'fraud', 'abuse', 'other') then
    raise exception 'Invalid report reason';
  end if;

  v_reason_details := trim(coalesce(p_reason_details, ''));
  if v_reason_details = '' then
    raise exception 'Please provide report details';
  end if;

  select j.client_id, ja.freelancer_id
  into v_client_id, v_freelancer_id
  from public.jobs j
  left join public.job_applications ja on ja.id = j.accepted_application_id
  where j.id = p_job_id;

  if v_client_id is null or v_freelancer_id is null then
    raise exception 'Only hired/completed jobs can be reported';
  end if;

  if v_reporter_id not in (v_client_id, v_freelancer_id) then
    raise exception 'You are not part of this job';
  end if;

  if p_reported_user_id not in (v_client_id, v_freelancer_id) then
    raise exception 'Reported user is not part of this job';
  end if;

  insert into public.user_reports (
    reporter_id,
    reported_user_id,
    job_id,
    reason_type,
    reason_details,
    status
  )
  values (
    v_reporter_id,
    p_reported_user_id,
    p_job_id,
    p_reason_type,
    v_reason_details,
    'submitted'
  )
  returning id into v_report_id;

  select concat_ws(' ', p.firstname, p.surname)
  into v_reporter_name
  from public.profiles p
  where p.id = v_reporter_id;

  v_reason_label := case p_reason_type
    when 'poor_work' then 'Poor work quality'
    when 'salary_issue' then 'Salary issue'
    when 'no_show' then 'No show'
    when 'fraud' then 'Fraud'
    when 'abuse' then 'Abuse'
    else 'Other'
  end;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    p_reported_user_id,
    'report_update',
    'You Were Reported',
    coalesce(nullif(v_reporter_name, ''), 'A user') || ' submitted a report against your account (' || v_reason_label || ').',
    jsonb_build_object(
      'report_id', v_report_id,
      'job_id', p_job_id,
      'reporter_id', v_reporter_id,
      'reporter_name', coalesce(nullif(v_reporter_name, ''), 'User'),
      'reason_type', p_reason_type,
      'reason_label', v_reason_label,
      'reason_details', v_reason_details,
      'report_status', 'submitted',
      'can_appeal', true
    )
  );

  return v_report_id;
end;
$$;

grant execute on function public.submit_user_report(uuid, uuid, text, text) to authenticated;
