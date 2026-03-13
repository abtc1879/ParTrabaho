-- Notify the report submitter when admin marks a report as valid.
-- "Valid" here means report status is updated to 'resolved'.

alter type public.notification_type_t
  add value if not exists 'report_update';

create or replace function public.admin_update_user_report(
  p_report_id uuid,
  p_status text,
  p_review_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reported_user_id uuid;
  v_reporter_id uuid;
  v_job_id uuid;
  v_prev_status text;
begin
  perform public.assert_admin_user(auth.uid());

  if p_status not in ('submitted', 'resolved', 'dismissed') then
    raise exception 'Invalid report status';
  end if;

  select r.status
  into v_prev_status
  from public.user_reports r
  where r.id = p_report_id;

  update public.user_reports
  set status = p_status,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = nullif(trim(coalesce(p_review_note, '')), '')
  where id = p_report_id
  returning reported_user_id, reporter_id, job_id
  into v_reported_user_id, v_reporter_id, v_job_id;

  if v_reported_user_id is null then
    raise exception 'Report not found';
  end if;

  perform public.apply_sanction_for_reported_user(v_reported_user_id);

  if p_status = 'resolved' and coalesce(v_prev_status, '') <> 'resolved' then
    insert into public.notifications (user_id, type, title, body, data)
    values (
      v_reporter_id,
      'report_update',
      'Report Marked Valid',
      'Your submitted report was reviewed and marked valid by admin.',
      jsonb_build_object(
        'report_id', p_report_id,
        'job_id', v_job_id,
        'reported_user_id', v_reported_user_id,
        'review_status', p_status
      )
    );

    insert into public.notifications (user_id, type, title, body, data)
    values (
      v_reported_user_id,
      'report_update',
      'Report Decision Update',
      'A report about your account was reviewed and marked valid by admin.',
      jsonb_build_object(
        'report_id', p_report_id,
        'job_id', v_job_id,
        'reporter_id', v_reporter_id,
        'review_status', p_status
      )
    );
  end if;

  return p_report_id;
end;
$$;

grant execute on function public.admin_update_user_report(uuid, text, text) to authenticated;
