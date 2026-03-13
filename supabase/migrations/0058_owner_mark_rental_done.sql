-- Allow owner to mark a rental reservation as done.

create or replace function public.owner_mark_rental_reservation_done(
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
    v_renter_id,
    'rental_update',
    'Rental Completed',
    'The owner marked the reservation as completed. Please leave a review.',
    jsonb_build_object('rental_id', v_rental_id, 'reservation_id', p_reservation_id, 'status', v_reservation.status)
  );

  return v_reservation;
end;
$$;

grant execute on function public.owner_mark_rental_reservation_done(uuid) to authenticated;
