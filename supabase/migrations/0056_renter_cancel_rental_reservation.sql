-- Allow renter to cancel rental reservations.

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
    set is_reserved = false
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
