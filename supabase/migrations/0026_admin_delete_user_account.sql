-- Allow admins to delete a user account (auth + profile) safely.

create or replace function public.admin_delete_user(
  p_user_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_is_admin boolean;
  v_admin_count integer;
begin
  perform public.assert_admin_user(auth.uid());

  if p_user_id is null then
    raise exception 'User id is required';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'You cannot delete your own account';
  end if;

  select is_admin
  into v_is_admin
  from public.profiles
  where id = p_user_id;

  if v_is_admin is null then
    raise exception 'User profile not found';
  end if;

  if v_is_admin = true then
    select count(*)::integer
    into v_admin_count
    from public.profiles
    where is_admin = true;

    if v_admin_count <= 1 then
      raise exception 'Cannot delete the last administrator';
    end if;
  end if;

  -- Delete from auth.users, which cascades to profiles and related rows.
  delete from auth.users
  where id = p_user_id;

  if not found then
    raise exception 'Auth user not found';
  end if;

  return p_user_id;
end;
$$;

grant execute on function public.admin_delete_user(uuid, text) to authenticated;
