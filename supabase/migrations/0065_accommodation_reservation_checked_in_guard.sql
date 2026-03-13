-- Prevent new reservations when already checked in.

create or replace function public.create_accommodation_reservation(
  p_accommodation_id uuid,
  p_room_rate_id uuid
)
returns public.accommodation_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guest_id uuid;
  v_owner_id uuid;
  v_guest_name text;
  v_accommodation_title text;
  v_room_classification text;
  v_room_price numeric(12, 2);
  v_existing_status public.accommodation_reservation_status_t;
  v_reservation public.accommodation_reservations;
begin
  v_guest_id := auth.uid();
  if v_guest_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.assert_user_not_restricted(v_guest_id);

  if p_room_rate_id is null then
    raise exception 'Room classification is required';
  end if;

  select owner_id, title
  into v_owner_id, v_accommodation_title
  from public.accommodation_listings
  where id = p_accommodation_id;

  if v_owner_id is null then
    raise exception 'Accommodation not found';
  end if;

  if v_owner_id = v_guest_id then
    raise exception 'You cannot reserve your own accommodation';
  end if;

  select classification, price_php
  into v_room_classification, v_room_price
  from public.accommodation_room_rates
  where id = p_room_rate_id
    and accommodation_id = p_accommodation_id;

  if v_room_classification is null then
    raise exception 'Room classification not found';
  end if;

  select status
  into v_existing_status
  from public.accommodation_reservations
  where accommodation_id = p_accommodation_id
    and guest_id = v_guest_id;

  if v_existing_status in ('accepted', 'completed', 'checked_in') then
    raise exception 'This reservation is already accepted or completed';
  end if;

  insert into public.accommodation_reservations (
    accommodation_id,
    room_rate_id,
    owner_id,
    guest_id,
    status
  )
  values (
    p_accommodation_id,
    p_room_rate_id,
    v_owner_id,
    v_guest_id,
    'pending'
  )
  on conflict (accommodation_id, guest_id) do update
    set room_rate_id = excluded.room_rate_id,
        status = 'pending'
  returning * into v_reservation;

  select concat_ws(' ', firstname, surname)
  into v_guest_name
  from public.profiles
  where id = v_guest_id;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_owner_id,
    'accommodation_reservation',
    'New Accommodation Reservation',
    coalesce(nullif(v_guest_name, ''), 'A guest') ||
      ' requested ' || v_room_classification ||
      ' (PHP ' || coalesce(v_room_price, 0)::text || ').',
    jsonb_build_object(
      'accommodation_id',
      p_accommodation_id,
      'reservation_id',
      v_reservation.id,
      'room_rate_id',
      p_room_rate_id,
      'status',
      v_reservation.status
    )
  );

  return v_reservation;
end;
$$;

grant execute on function public.create_accommodation_reservation(uuid, uuid) to authenticated;
