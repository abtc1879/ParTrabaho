-- Allow one review per completed stay and enable re-rating after new stays.

alter table public.accommodation_reservations
  add column if not exists last_reviewed_at timestamptz;

alter table public.accommodation_reviews
  drop constraint if exists accommodation_reviews_accommodation_id_reviewer_id_key;

with latest_reviews as (
  select
    r.id as reservation_id,
    max(ar.created_at) as last_reviewed_at
  from public.accommodation_reservations r
  join public.accommodation_reviews ar
    on ar.accommodation_id = r.accommodation_id
   and ar.reviewer_id = r.guest_id
  group by r.id
)
update public.accommodation_reservations r
set last_reviewed_at = lr.last_reviewed_at
from latest_reviews lr
where r.id = lr.reservation_id;

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
  v_last_reviewed_at timestamptz;
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

  select status, last_reviewed_at
  into v_existing_status, v_last_reviewed_at
  from public.accommodation_reservations
  where accommodation_id = p_accommodation_id
    and guest_id = v_guest_id;

  if v_existing_status in ('accepted', 'checked_in') then
    raise exception 'This reservation is already in progress';
  end if;

  if v_existing_status = 'completed' and v_last_reviewed_at is null then
    raise exception 'Please rate this accommodation before reserving again';
  end if;

  insert into public.accommodation_reservations (
    accommodation_id,
    room_rate_id,
    owner_id,
    guest_id,
    status,
    last_reviewed_at
  )
  values (
    p_accommodation_id,
    p_room_rate_id,
    v_owner_id,
    v_guest_id,
    'pending',
    null
  )
  on conflict (accommodation_id, guest_id) do update
    set room_rate_id = excluded.room_rate_id,
        status = 'pending',
        last_reviewed_at = null
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

create or replace function public.submit_accommodation_review(
  p_reservation_id uuid,
  p_stars integer,
  p_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_guest_id uuid;
  v_owner_id uuid;
  v_accommodation_id uuid;
  v_status public.accommodation_reservation_status_t;
  v_last_reviewed_at timestamptz;
  v_review_id uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.assert_user_not_restricted(v_actor_id);

  if p_stars < 1 or p_stars > 5 then
    raise exception 'Stars must be between 1 and 5';
  end if;

  select guest_id, owner_id, accommodation_id, status, last_reviewed_at
  into v_guest_id, v_owner_id, v_accommodation_id, v_status, v_last_reviewed_at
  from public.accommodation_reservations
  where id = p_reservation_id;

  if v_guest_id is null then
    raise exception 'Reservation not found';
  end if;

  if v_actor_id <> v_guest_id then
    raise exception 'You are not allowed to rate this reservation';
  end if;

  if v_status <> 'completed' then
    raise exception 'Reservation must be checked out before rating';
  end if;

  if v_last_reviewed_at is not null then
    raise exception 'You already rated this stay';
  end if;

  insert into public.accommodation_reviews (
    accommodation_id,
    reviewer_id,
    owner_id,
    stars,
    comment
  )
  values (
    v_accommodation_id,
    v_actor_id,
    v_owner_id,
    p_stars,
    p_comment
  )
  returning id into v_review_id;

  update public.accommodation_reservations
  set last_reviewed_at = now()
  where id = p_reservation_id;

  update public.profiles
  set accommodation_rating_count = accommodation_rating_count + 1,
      accommodation_rating_avg = round(((accommodation_rating_avg * accommodation_rating_count + p_stars)::numeric / (accommodation_rating_count + 1)), 1)
  where id = v_owner_id;

  return v_review_id;
end;
$$;

grant execute on function public.submit_accommodation_review(uuid, integer, text) to authenticated;
