-- Allow owner to accept and check-in accommodation reservations.

create or replace function public.owner_accept_accommodation_reservation(
  p_reservation_id uuid
)
returns public.accommodation_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_guest_id uuid;
  v_accommodation_id uuid;
  v_room_rate_id uuid;
  v_room_classification text;
  v_status public.accommodation_reservation_status_t;
  v_accommodation_title text;
  v_reservation public.accommodation_reservations;
begin
  v_owner_id := auth.uid();
  if v_owner_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.assert_user_not_restricted(v_owner_id);

  select owner_id, guest_id, accommodation_id, room_rate_id, status
  into v_owner_id, v_guest_id, v_accommodation_id, v_room_rate_id, v_status
  from public.accommodation_reservations
  where id = p_reservation_id;

  if v_guest_id is null then
    raise exception 'Reservation not found';
  end if;

  if auth.uid() <> v_owner_id then
    raise exception 'You are not allowed to update this reservation';
  end if;

  if v_status <> 'pending' then
    raise exception 'Reservation must be pending before accepting';
  end if;

  update public.accommodation_reservations
  set status = 'accepted'
  where id = p_reservation_id
  returning * into v_reservation;

  select title
  into v_accommodation_title
  from public.accommodation_listings
  where id = v_accommodation_id;

  select classification
  into v_room_classification
  from public.accommodation_room_rates
  where id = v_room_rate_id;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_guest_id,
    'accommodation_update',
    'Reservation Accepted',
    'The host accepted your reservation for ' ||
      coalesce(v_room_classification, 'a room') ||
      ' at ' || coalesce(v_accommodation_title, 'the accommodation') || '.',
    jsonb_build_object(
      'accommodation_id',
      v_accommodation_id,
      'reservation_id',
      p_reservation_id,
      'room_rate_id',
      v_room_rate_id,
      'status',
      v_reservation.status
    )
  );

  return v_reservation;
end;
$$;

grant execute on function public.owner_accept_accommodation_reservation(uuid) to authenticated;

create or replace function public.owner_checkin_accommodation_reservation(
  p_reservation_id uuid
)
returns public.accommodation_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_guest_id uuid;
  v_accommodation_id uuid;
  v_room_rate_id uuid;
  v_room_classification text;
  v_status public.accommodation_reservation_status_t;
  v_accommodation_title text;
  v_reservation public.accommodation_reservations;
begin
  v_owner_id := auth.uid();
  if v_owner_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.assert_user_not_restricted(v_owner_id);

  select owner_id, guest_id, accommodation_id, room_rate_id, status
  into v_owner_id, v_guest_id, v_accommodation_id, v_room_rate_id, v_status
  from public.accommodation_reservations
  where id = p_reservation_id;

  if v_guest_id is null then
    raise exception 'Reservation not found';
  end if;

  if auth.uid() <> v_owner_id then
    raise exception 'You are not allowed to update this reservation';
  end if;

  if v_status <> 'accepted' then
    raise exception 'Reservation must be accepted before check-in';
  end if;

  update public.accommodation_reservations
  set status = 'completed'
  where id = p_reservation_id
  returning * into v_reservation;

  select title
  into v_accommodation_title
  from public.accommodation_listings
  where id = v_accommodation_id;

  select classification
  into v_room_classification
  from public.accommodation_room_rates
  where id = v_room_rate_id;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_guest_id,
    'accommodation_update',
    'Guest Checked In',
    'You are checked in for ' ||
      coalesce(v_room_classification, 'a room') ||
      ' at ' || coalesce(v_accommodation_title, 'the accommodation') || '.',
    jsonb_build_object(
      'accommodation_id',
      v_accommodation_id,
      'reservation_id',
      p_reservation_id,
      'room_rate_id',
      v_room_rate_id,
      'status',
      v_reservation.status
    )
  );

  return v_reservation;
end;
$$;

grant execute on function public.owner_checkin_accommodation_reservation(uuid) to authenticated;
