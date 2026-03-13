-- Rental listing rented status + owner mark rented action.

alter table public.rental_listings
  add column if not exists is_rented boolean not null default false;

create or replace function public.create_rental_reservation(
  p_rental_id uuid,
  p_days integer,
  p_include_driver boolean default false
)
returns public.rental_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_renter_id uuid;
  v_owner_id uuid;
  v_renter_name text;
  v_rental_title text;
  v_is_reserved boolean := false;
  v_is_rented boolean := false;
  v_existing_status public.rental_reservation_status_t;
  v_reservation public.rental_reservations;
begin
  v_renter_id := auth.uid();
  if v_renter_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.assert_user_not_restricted(v_renter_id);

  if p_days is null or p_days < 1 then
    raise exception 'Days must be at least 1';
  end if;

  select owner_id, title, is_reserved, is_rented
  into v_owner_id, v_rental_title, v_is_reserved, v_is_rented
  from public.rental_listings
  where id = p_rental_id;

  if v_owner_id is null then
    raise exception 'Rental not found';
  end if;

  if v_owner_id = v_renter_id then
    raise exception 'You cannot reserve your own rental';
  end if;

  if v_is_rented then
    raise exception 'Rental is already rented';
  end if;

  if v_is_reserved then
    raise exception 'Rental is already reserved';
  end if;

  select status
  into v_existing_status
  from public.rental_reservations
  where rental_id = p_rental_id
    and renter_id = v_renter_id;

  if v_existing_status in ('accepted', 'completed') then
    raise exception 'This reservation is already accepted or completed';
  end if;

  if exists (
    select 1
    from public.rental_reservations rr
    where rr.rental_id = p_rental_id
      and rr.status in ('pending', 'accepted')
      and rr.renter_id <> v_renter_id
  ) then
    raise exception 'Rental already has an active reservation';
  end if;

  insert into public.rental_reservations (
    rental_id,
    owner_id,
    renter_id,
    days,
    include_driver,
    status
  )
  values (
    p_rental_id,
    v_owner_id,
    v_renter_id,
    p_days,
    coalesce(p_include_driver, false),
    'pending'
  )
  on conflict (rental_id, renter_id) do update
    set days = excluded.days,
        include_driver = excluded.include_driver,
        status = 'pending'
  returning * into v_reservation;

  select concat_ws(' ', firstname, surname)
  into v_renter_name
  from public.profiles
  where id = v_renter_id;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_owner_id,
    'rental_reservation',
    'New Rental Reservation',
    coalesce(nullif(v_renter_name, ''), 'A renter') ||
      ' requested ' || p_days || ' day' || case when p_days = 1 then '' else 's' end ||
      case when coalesce(p_include_driver, false) then ' with driver.' else ' without driver.' end,
    jsonb_build_object('rental_id', p_rental_id, 'reservation_id', v_reservation.id)
  );

  return v_reservation;
end;
$$;

grant execute on function public.create_rental_reservation(uuid, integer, boolean) to authenticated;

create or replace function public.owner_update_rental_reservation(
  p_reservation_id uuid,
  p_decision text
)
returns public.rental_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_renter_id uuid;
  v_rental_id uuid;
  v_rental_title text;
  v_decision text;
  v_owner_name text;
  v_reservation public.rental_reservations;
begin
  v_decision := lower(coalesce(trim(p_decision), ''));
  if v_decision not in ('accept', 'cancel') then
    raise exception 'Decision must be accept or cancel';
  end if;

  select owner_id, renter_id, rental_id
  into v_owner_id, v_renter_id, v_rental_id
  from public.rental_reservations
  where id = p_reservation_id;

  if v_owner_id is null then
    raise exception 'Reservation not found';
  end if;

  if auth.uid() <> v_owner_id then
    raise exception 'You are not allowed to update this reservation';
  end if;

  if v_decision = 'accept' then
    update public.rental_reservations
    set status = 'accepted'
    where id = p_reservation_id
    returning * into v_reservation;

    update public.rental_listings
    set is_reserved = true
    where id = v_rental_id;
  else
    update public.rental_reservations
    set status = 'cancelled'
    where id = p_reservation_id
    returning * into v_reservation;

    update public.rental_listings
    set is_reserved = false,
        is_rented = false
    where id = v_rental_id;
  end if;

  select concat_ws(' ', firstname, surname)
  into v_owner_name
  from public.profiles
  where id = v_owner_id;

  select title
  into v_rental_title
  from public.rental_listings
  where id = v_rental_id;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_renter_id,
    'rental_update',
    'Rental Reservation Update',
    coalesce(nullif(v_owner_name, ''), 'Owner') ||
      case when v_decision = 'accept' then ' accepted' else ' cancelled' end ||
      ' your reservation for ' || coalesce(v_rental_title, 'the rental') || '.',
    jsonb_build_object('rental_id', v_rental_id, 'reservation_id', p_reservation_id, 'status', v_reservation.status)
  );

  return v_reservation;
end;
$$;

grant execute on function public.owner_update_rental_reservation(uuid, text) to authenticated;

create or replace function public.renter_cancel_rental_reservation(
  p_reservation_id uuid
)
returns public.rental_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_renter_id uuid;
  v_owner_id uuid;
  v_rental_id uuid;
  v_status public.rental_reservation_status_t;
  v_rental_title text;
  v_reservation public.rental_reservations;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.assert_user_not_restricted(v_actor_id);

  select renter_id, owner_id, rental_id, status
  into v_renter_id, v_owner_id, v_rental_id, v_status
  from public.rental_reservations
  where id = p_reservation_id;

  if v_owner_id is null then
    raise exception 'Reservation not found';
  end if;

  if v_actor_id <> v_renter_id then
    raise exception 'You are not allowed to cancel this reservation';
  end if;

  if v_status not in ('pending', 'accepted') then
    raise exception 'Reservation cannot be cancelled right now';
  end if;

  update public.rental_reservations
  set status = 'cancelled'
  where id = p_reservation_id
  returning * into v_reservation;

  if v_status = 'accepted' then
    update public.rental_listings
    set is_reserved = false,
        is_rented = false
    where id = v_rental_id;
  end if;

  select title
  into v_rental_title
  from public.rental_listings
  where id = v_rental_id;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_owner_id,
    'rental_update',
    'Reservation Cancelled',
    'The renter cancelled the reservation for ' || coalesce(v_rental_title, 'the rental') || '.',
    jsonb_build_object('rental_id', v_rental_id, 'reservation_id', p_reservation_id, 'status', v_reservation.status)
  );

  return v_reservation;
end;
$$;

grant execute on function public.renter_cancel_rental_reservation(uuid) to authenticated;

create or replace function public.mark_rental_reservation_done(
  p_reservation_id uuid
)
returns public.rental_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_renter_id uuid;
  v_owner_id uuid;
  v_rental_id uuid;
  v_status public.rental_reservation_status_t;
  v_reservation public.rental_reservations;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.assert_user_not_restricted(v_actor_id);

  select renter_id, owner_id, rental_id, status
  into v_renter_id, v_owner_id, v_rental_id, v_status
  from public.rental_reservations
  where id = p_reservation_id;

  if v_owner_id is null then
    raise exception 'Reservation not found';
  end if;

  if v_actor_id <> v_renter_id then
    raise exception 'You are not allowed to complete this reservation';
  end if;

  if v_status <> 'accepted' then
    raise exception 'Reservation must be accepted before completing';
  end if;

  update public.rental_reservations
  set status = 'completed',
      completed_at = now()
  where id = p_reservation_id
  returning * into v_reservation;

  update public.rental_listings
  set is_reserved = false,
      is_rented = false
  where id = v_rental_id;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_owner_id,
    'rental_update',
    'Rental Completed',
    'The renter marked the reservation as completed.',
    jsonb_build_object('rental_id', v_rental_id, 'reservation_id', p_reservation_id, 'status', v_reservation.status)
  );

  return v_reservation;
end;
$$;

grant execute on function public.mark_rental_reservation_done(uuid) to authenticated;

create or replace function public.owner_mark_rental_rented(
  p_reservation_id uuid
)
returns public.rental_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_renter_id uuid;
  v_rental_id uuid;
  v_status public.rental_reservation_status_t;
  v_reservation public.rental_reservations;
begin
  select owner_id, renter_id, rental_id, status
  into v_owner_id, v_renter_id, v_rental_id, v_status
  from public.rental_reservations
  where id = p_reservation_id;

  if v_owner_id is null then
    raise exception 'Reservation not found';
  end if;

  if auth.uid() <> v_owner_id then
    raise exception 'You are not allowed to update this reservation';
  end if;

  if v_status <> 'accepted' then
    raise exception 'Reservation must be accepted before marking as rented';
  end if;

  update public.rental_listings
  set is_rented = true,
      is_reserved = true
  where id = v_rental_id;

  update public.rental_reservations
  set status = 'completed',
      completed_at = now()
  where id = p_reservation_id
  returning * into v_reservation;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_renter_id,
    'rental_update',
    'Rental Marked as Rented',
    'The owner marked this rental as already rented. Please leave a review.',
    jsonb_build_object('rental_id', v_rental_id, 'reservation_id', p_reservation_id, 'status', v_reservation.status)
  );

  return v_reservation;
end;
$$;

grant execute on function public.owner_mark_rental_rented(uuid) to authenticated;
