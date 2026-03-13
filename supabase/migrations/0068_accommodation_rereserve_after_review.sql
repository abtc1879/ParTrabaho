-- Allow guests to reserve again after a completed stay with a review.

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

  if v_existing_status in ('accepted', 'checked_in') then
    raise exception 'This reservation is already in progress';
  end if;

  if v_existing_status = 'completed' then
    if not exists (
      select 1
      from public.accommodation_reviews r
      where r.accommodation_id = p_accommodation_id
        and r.reviewer_id = v_guest_id
    ) then
      raise exception 'Please rate this accommodation before reserving again';
    end if;
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
