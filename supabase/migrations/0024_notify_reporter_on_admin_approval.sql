-- Notify the report submitter with explicit "acknowledged and approved" wording
-- when admin marks the report as valid (resolved).

create or replace function public.admin_update_user_report(
  p_report_id uuid,
  p_status text,
  p_review_note text default null,
  p_sanction_action text default 'none',
  p_suspend_days integer default null
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
  v_sanction_action text;
  v_suspended_until timestamptz;
  v_reporter_body text;
  v_reported_body text;
begin
  perform public.assert_admin_user(auth.uid());

  if p_status not in ('submitted', 'resolved', 'dismissed') then
    raise exception 'Invalid report status';
  end if;

  v_sanction_action := lower(trim(coalesce(p_sanction_action, 'none')));
  if v_sanction_action not in ('none', 'suspend', 'block') then
    raise exception 'Invalid sanction action';
  end if;

  if v_sanction_action = 'suspend' then
    if coalesce(p_suspend_days, 0) < 1 or p_suspend_days > 3650 then
      raise exception 'Suspension days must be between 1 and 3650';
    end if;
    v_suspended_until := now() + make_interval(days => p_suspend_days);
  else
    v_suspended_until := null;
  end if;

  select r.status
  into v_prev_status
  from public.user_reports r
  where r.id = p_report_id;

  update public.user_reports
  set status = p_status,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = nullif(trim(coalesce(p_review_note, '')), ''),
      sanction_action = case when p_status = 'resolved' then v_sanction_action else 'none' end,
      sanction_days = case when p_status = 'resolved' and v_sanction_action = 'suspend' then p_suspend_days else null end,
      sanctioned_until = case when p_status = 'resolved' and v_sanction_action = 'suspend' then v_suspended_until else null end
  where id = p_report_id
  returning reported_user_id, reporter_id, job_id
  into v_reported_user_id, v_reporter_id, v_job_id;

  if v_reported_user_id is null then
    raise exception 'Report not found';
  end if;

  if p_status = 'resolved' then
    if v_sanction_action = 'block' then
      update public.profiles
      set blocked_listed = true,
          suspended_until = null
      where id = v_reported_user_id;

      v_reporter_body := 'Admin acknowledged and approved your report as valid. The reported account has been blocked.';
      v_reported_body := 'A report against your account was marked valid by admin. Your account has been blocked.';
    elsif v_sanction_action = 'suspend' then
      update public.profiles
      set suspended_until = v_suspended_until
      where id = v_reported_user_id;

      v_reporter_body := 'Admin acknowledged and approved your report as valid. The reported account was suspended.';
      v_reported_body := 'A report against your account was marked valid by admin. Your account was suspended.';
    else
      v_reporter_body := 'Admin acknowledged and approved your report as valid. No suspension was applied.';
      v_reported_body := 'A report against your account was marked valid by admin. No suspension was applied.';
    end if;
  end if;

  perform public.apply_sanction_for_reported_user(v_reported_user_id);

  if p_status = 'resolved' and coalesce(v_prev_status, '') <> 'resolved' then
    insert into public.notifications (user_id, type, title, body, data)
    values (
      v_reporter_id,
      'report_update',
      'Report Approved by Admin',
      v_reporter_body,
      jsonb_build_object(
        'report_id', p_report_id,
        'job_id', v_job_id,
        'reported_user_id', v_reported_user_id,
        'review_status', p_status,
        'sanction_action', v_sanction_action,
        'sanction_days', case when v_sanction_action = 'suspend' then p_suspend_days else null end,
        'sanctioned_until', case when v_sanction_action = 'suspend' then v_suspended_until else null end
      )
    );

    insert into public.notifications (user_id, type, title, body, data)
    values (
      v_reported_user_id,
      'report_update',
      'Report Decision Update',
      v_reported_body,
      jsonb_build_object(
        'report_id', p_report_id,
        'job_id', v_job_id,
        'reporter_id', v_reporter_id,
        'review_status', p_status,
        'sanction_action', v_sanction_action,
        'sanction_days', case when v_sanction_action = 'suspend' then p_suspend_days else null end,
        'sanctioned_until', case when v_sanction_action = 'suspend' then v_suspended_until else null end
      )
    );
  end if;

  return p_report_id;
end;
$$;

grant execute on function public.admin_update_user_report(uuid, text, text, text, integer) to authenticated;
