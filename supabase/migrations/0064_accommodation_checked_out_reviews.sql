-- Check-out flow + accommodation reviews submission.

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
  else
    v_notify_id := v_owner_id;
    v_notify_label := 'The guest checked out';
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

  return v_reservation;
end;
$$;

grant execute on function public.mark_accommodation_checked_out(uuid) to authenticated;

drop policy if exists "Accommodation reviews insert by authenticated users" on public.accommodation_reviews;
create policy "Accommodation reviews insert by authenticated users"
on public.accommodation_reviews
for insert
to authenticated
with check (auth.uid() = reviewer_id and not public.is_user_restricted(auth.uid()));

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

  select guest_id, owner_id, accommodation_id, status
  into v_guest_id, v_owner_id, v_accommodation_id, v_status
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

  if exists (
    select 1
    from public.accommodation_reviews r
    where r.accommodation_id = v_accommodation_id
      and r.reviewer_id = v_actor_id
  ) then
    raise exception 'You already submitted a rating for this accommodation';
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

  update public.profiles
  set accommodation_rating_count = accommodation_rating_count + 1,
      accommodation_rating_avg = round(((accommodation_rating_avg * accommodation_rating_count + p_stars)::numeric / (accommodation_rating_count + 1)), 1)
  where id = v_owner_id;

  return v_review_id;
end;
$$;

grant execute on function public.submit_accommodation_review(uuid, integer, text) to authenticated;
