-- Do not suspend/block users immediately when reported.
-- Apply sanctions only after admin marks report as valid (status = 'resolved').

create or replace function public.apply_sanction_for_reported_user(p_reported_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offense_count integer;
  v_suspended_until timestamptz;
  v_blocked boolean := false;
begin
  -- Only admin-validated reports count as offenses.
  select count(*)::integer
  into v_offense_count
  from public.user_reports r
  where r.reported_user_id = p_reported_user_id
    and r.status = 'resolved';

  if v_offense_count >= 4 then
    v_blocked := true;
    v_suspended_until := null;
  elsif v_offense_count = 3 then
    v_suspended_until := now() + interval '1 year';
  elsif v_offense_count = 2 then
    v_suspended_until := now() + interval '1 month';
  elsif v_offense_count = 1 then
    v_suspended_until := now() + interval '1 week';
  else
    v_suspended_until := null;
  end if;

  update public.profiles
  set offense_count = v_offense_count,
      suspended_until = v_suspended_until,
      blocked_listed = v_blocked
  where id = p_reported_user_id;
end;
$$;

grant execute on function public.apply_sanction_for_reported_user(uuid) to authenticated;

-- Recompute all users so pending/submitted reports no longer trigger restrictions.
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
