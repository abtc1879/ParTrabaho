-- Let admin decide suspension outcome/duration when marking reports as valid.
-- Also stop automatic suspend/block side-effects from offense recount function.

alter table public.user_reports
  add column if not exists sanction_action text not null default 'none',
  add column if not exists sanction_days integer,
  add column if not exists sanctioned_until timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_reports_sanction_action_check'
      and conrelid = 'public.user_reports'::regclass
  ) then
    alter table public.user_reports
      add constraint user_reports_sanction_action_check
      check (sanction_action in ('none', 'suspend', 'block'));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_reports_sanction_days_check'
      and conrelid = 'public.user_reports'::regclass
  ) then
    alter table public.user_reports
      add constraint user_reports_sanction_days_check
      check (sanction_days is null or sanction_days between 1 and 3650);
  end if;
end;
$$;

create or replace function public.apply_sanction_for_reported_user(p_reported_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offense_count integer;
begin
  -- Offense count is tracked from admin-validated reports only.
  -- Suspension/block itself is decided manually by admin_review action.
  select count(*)::integer
  into v_offense_count
  from public.user_reports r
  where r.reported_user_id = p_reported_user_id
    and r.status = 'resolved';

  update public.profiles
  set offense_count = v_offense_count
  where id = p_reported_user_id;
end;
$$;

grant execute on function public.apply_sanction_for_reported_user(uuid) to authenticated;

drop function if exists public.admin_update_user_report(uuid, text, text);

create function public.admin_update_user_report(
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

      v_reporter_body := 'Your submitted report was marked valid. The reported account has been blocked.';
      v_reported_body := 'A report against your account was marked valid. Your account has been blocked by admin.';
    elsif v_sanction_action = 'suspend' then
      update public.profiles
      set suspended_until = v_suspended_until
      where id = v_reported_user_id;

      v_reporter_body := 'Your submitted report was marked valid. The reported account was suspended by admin.';
      v_reported_body := 'A report against your account was marked valid. Your account was suspended by admin.';
    else
      v_reporter_body := 'Your submitted report was marked valid. No suspension was applied.';
      v_reported_body := 'A report against your account was marked valid. No suspension was applied.';
    end if;
  end if;

  perform public.apply_sanction_for_reported_user(v_reported_user_id);

  if p_status = 'resolved' and coalesce(v_prev_status, '') <> 'resolved' then
    insert into public.notifications (user_id, type, title, body, data)
    values (
      v_reporter_id,
      'report_update',
      'Report Marked Valid',
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

-- Recompute offense counters without changing suspension/block statuses.
do $$
declare
  v_profile_id uuid;
begin
  for v_profile_id in
    select p.id
    from public.profiles p
  loop
    perform public.apply_sanction_for_reported_user(v_profile_id);
  end loop;
end;
$$;
