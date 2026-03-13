-- Add chat messages for accommodation reservation updates.

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
  v_conversation_id uuid;
  v_message text;
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

  select id
  into v_conversation_id
  from public.conversations
  where accommodation_id = p_accommodation_id
    and client_id = v_owner_id
    and freelancer_id = v_guest_id;

  if v_conversation_id is null then
    begin
      insert into public.conversations (job_id, product_id, rental_id, accommodation_id, client_id, freelancer_id)
      values (null, null, null, p_accommodation_id, v_owner_id, v_guest_id)
      returning id into v_conversation_id;
    exception
      when unique_violation then
        select id
        into v_conversation_id
        from public.conversations
        where accommodation_id = p_accommodation_id
          and client_id = v_owner_id
          and freelancer_id = v_guest_id;
    end;
  end if;

  if v_conversation_id is not null then
    v_message := 'Reservation request: ' || v_room_classification ||
      ' (PHP ' || coalesce(v_room_price, 0)::text || ').';
    insert into public.messages (conversation_id, sender_id, body)
    values (v_conversation_id, v_guest_id, v_message);
  end if;

  return v_reservation;
end;
$$;

grant execute on function public.create_accommodation_reservation(uuid, uuid) to authenticated;

create or replace function public.guest_cancel_accommodation_reservation(
  p_reservation_id uuid
)
returns public.accommodation_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guest_id uuid;
  v_owner_id uuid;
  v_accommodation_id uuid;
  v_room_rate_id uuid;
  v_room_classification text;
  v_status public.accommodation_reservation_status_t;
  v_accommodation_title text;
  v_reservation public.accommodation_reservations;
  v_conversation_id uuid;
  v_message text;
begin
  v_guest_id := auth.uid();
  if v_guest_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.assert_user_not_restricted(v_guest_id);

  select guest_id, owner_id, accommodation_id, room_rate_id, status
  into v_guest_id, v_owner_id, v_accommodation_id, v_room_rate_id, v_status
  from public.accommodation_reservations
  where id = p_reservation_id;

  if v_owner_id is null then
    raise exception 'Reservation not found';
  end if;

  if auth.uid() <> v_guest_id then
    raise exception 'You are not allowed to cancel this reservation';
  end if;

  if v_status not in ('pending', 'accepted') then
    raise exception 'Reservation cannot be cancelled right now';
  end if;

  update public.accommodation_reservations
  set status = 'cancelled'
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
    v_owner_id,
    'accommodation_update',
    'Reservation Cancelled',
    'The guest cancelled the reservation for ' ||
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

  select id
  into v_conversation_id
  from public.conversations
  where accommodation_id = v_accommodation_id
    and client_id = v_owner_id
    and freelancer_id = v_guest_id;

  if v_conversation_id is null then
    begin
      insert into public.conversations (job_id, product_id, rental_id, accommodation_id, client_id, freelancer_id)
      values (null, null, null, v_accommodation_id, v_owner_id, v_guest_id)
      returning id into v_conversation_id;
    exception
      when unique_violation then
        select id
        into v_conversation_id
        from public.conversations
        where accommodation_id = v_accommodation_id
          and client_id = v_owner_id
          and freelancer_id = v_guest_id;
    end;
  end if;

  if v_conversation_id is not null then
    v_message := 'Reservation cancelled for ' || coalesce(v_room_classification, 'a room') || '.';
    insert into public.messages (conversation_id, sender_id, body)
    values (v_conversation_id, v_guest_id, v_message);
  end if;

  return v_reservation;
end;
$$;

grant execute on function public.guest_cancel_accommodation_reservation(uuid) to authenticated;

create or replace function public.owner_cancel_accommodation_reservation(
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
  v_conversation_id uuid;
  v_message text;
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
    raise exception 'You are not allowed to cancel this reservation';
  end if;

  if v_status not in ('pending', 'accepted') then
    raise exception 'Reservation cannot be cancelled right now';
  end if;

  update public.accommodation_reservations
  set status = 'cancelled'
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
    'Reservation Cancelled',
    'The host cancelled the reservation for ' ||
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

  select id
  into v_conversation_id
  from public.conversations
  where accommodation_id = v_accommodation_id
    and client_id = v_owner_id
    and freelancer_id = v_guest_id;

  if v_conversation_id is null then
    begin
      insert into public.conversations (job_id, product_id, rental_id, accommodation_id, client_id, freelancer_id)
      values (null, null, null, v_accommodation_id, v_owner_id, v_guest_id)
      returning id into v_conversation_id;
    exception
      when unique_violation then
        select id
        into v_conversation_id
        from public.conversations
        where accommodation_id = v_accommodation_id
          and client_id = v_owner_id
          and freelancer_id = v_guest_id;
    end;
  end if;

  if v_conversation_id is not null then
    v_message := 'Host cancelled the reservation for ' || coalesce(v_room_classification, 'a room') || '.';
    insert into public.messages (conversation_id, sender_id, body)
    values (v_conversation_id, v_owner_id, v_message);
  end if;

  return v_reservation;
end;
$$;

grant execute on function public.owner_cancel_accommodation_reservation(uuid) to authenticated;

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
  v_conversation_id uuid;
  v_message text;
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

  select id
  into v_conversation_id
  from public.conversations
  where accommodation_id = v_accommodation_id
    and client_id = v_owner_id
    and freelancer_id = v_guest_id;

  if v_conversation_id is null then
    begin
      insert into public.conversations (job_id, product_id, rental_id, accommodation_id, client_id, freelancer_id)
      values (null, null, null, v_accommodation_id, v_owner_id, v_guest_id)
      returning id into v_conversation_id;
    exception
      when unique_violation then
        select id
        into v_conversation_id
        from public.conversations
        where accommodation_id = v_accommodation_id
          and client_id = v_owner_id
          and freelancer_id = v_guest_id;
    end;
  end if;

  if v_conversation_id is not null then
    v_message := 'Reservation accepted for ' || coalesce(v_room_classification, 'a room') || '.';
    insert into public.messages (conversation_id, sender_id, body)
    values (v_conversation_id, v_owner_id, v_message);
  end if;

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
  v_conversation_id uuid;
  v_message text;
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
  set status = 'checked_in'
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

  select id
  into v_conversation_id
  from public.conversations
  where accommodation_id = v_accommodation_id
    and client_id = v_owner_id
    and freelancer_id = v_guest_id;

  if v_conversation_id is null then
    begin
      insert into public.conversations (job_id, product_id, rental_id, accommodation_id, client_id, freelancer_id)
      values (null, null, null, v_accommodation_id, v_owner_id, v_guest_id)
      returning id into v_conversation_id;
    exception
      when unique_violation then
        select id
        into v_conversation_id
        from public.conversations
        where accommodation_id = v_accommodation_id
          and client_id = v_owner_id
          and freelancer_id = v_guest_id;
    end;
  end if;

  if v_conversation_id is not null then
    v_message := 'Guest checked in for ' || coalesce(v_room_classification, 'a room') || '.';
    insert into public.messages (conversation_id, sender_id, body)
    values (v_conversation_id, v_owner_id, v_message);
  end if;

  return v_reservation;
end;
$$;

grant execute on function public.owner_checkin_accommodation_reservation(uuid) to authenticated;

create or replace function public.mark_accommodation_checked_out(
  p_reservation_id uuid
)
returns public.accommodation_reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_owner_id uuid;
  v_guest_id uuid;
  v_accommodation_id uuid;
  v_room_rate_id uuid;
  v_room_classification text;
  v_status public.accommodation_reservation_status_t;
  v_accommodation_title text;
  v_reservation public.accommodation_reservations;
  v_notify_id uuid;
  v_notify_label text;
  v_conversation_id uuid;
  v_message text;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.assert_user_not_restricted(v_actor_id);

  select owner_id, guest_id, accommodation_id, room_rate_id, status
  into v_owner_id, v_guest_id, v_accommodation_id, v_room_rate_id, v_status
  from public.accommodation_reservations
  where id = p_reservation_id;

  if v_guest_id is null then
    raise exception 'Reservation not found';
  end if;

  if v_actor_id <> v_owner_id and v_actor_id <> v_guest_id then
    raise exception 'You are not allowed to update this reservation';
  end if;

  if v_status <> 'checked_in' then
    raise exception 'Reservation must be checked in before checking out';
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

  if v_actor_id = v_owner_id then
    v_notify_id := v_guest_id;
    v_notify_label := 'The host checked you out';
    v_message := 'Host checked out the guest for ' || coalesce(v_room_classification, 'a room') || '.';
  else
    v_notify_id := v_owner_id;
    v_notify_label := 'The guest checked out';
    v_message := 'Guest checked out for ' || coalesce(v_room_classification, 'a room') || '.';
  end if;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_notify_id,
    'accommodation_update',
    'Guest Checked Out',
    v_notify_label || ' for ' ||
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

  select id
  into v_conversation_id
  from public.conversations
  where accommodation_id = v_accommodation_id
    and client_id = v_owner_id
    and freelancer_id = v_guest_id;

  if v_conversation_id is null then
    begin
      insert into public.conversations (job_id, product_id, rental_id, accommodation_id, client_id, freelancer_id)
      values (null, null, null, v_accommodation_id, v_owner_id, v_guest_id)
      returning id into v_conversation_id;
    exception
      when unique_violation then
        select id
        into v_conversation_id
        from public.conversations
        where accommodation_id = v_accommodation_id
          and client_id = v_owner_id
          and freelancer_id = v_guest_id;
    end;
  end if;

  if v_conversation_id is not null then
    insert into public.messages (conversation_id, sender_id, body)
    values (v_conversation_id, v_actor_id, v_message);
  end if;

  return v_reservation;
end;
$$;

grant execute on function public.mark_accommodation_checked_out(uuid) to authenticated;
