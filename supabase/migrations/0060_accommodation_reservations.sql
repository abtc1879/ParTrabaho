-- Accommodation reservations for room classifications.

alter type public.notification_type_t
  add value if not exists 'accommodation_reservation';

alter type public.notification_type_t
  add value if not exists 'accommodation_update';

do $$
begin
  create type public.accommodation_reservation_status_t as enum ('pending', 'accepted', 'cancelled', 'completed');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.accommodation_reservations (
  id uuid primary key default gen_random_uuid(),
  accommodation_id uuid not null references public.accommodation_listings(id) on delete cascade,
  room_rate_id uuid references public.accommodation_room_rates(id) on delete set null,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  guest_id uuid not null references public.profiles(id) on delete cascade,
  status public.accommodation_reservation_status_t not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (accommodation_id, guest_id)
);

create index if not exists idx_accommodation_reservations_owner_created
  on public.accommodation_reservations(owner_id, created_at desc);

create index if not exists idx_accommodation_reservations_guest_created
  on public.accommodation_reservations(guest_id, created_at desc);

drop trigger if exists set_accommodation_reservations_updated_at on public.accommodation_reservations;
create trigger set_accommodation_reservations_updated_at
before update on public.accommodation_reservations
for each row execute function public.set_updated_at();

alter table public.accommodation_reservations enable row level security;

drop policy if exists "Accommodation reservations readable by participants" on public.accommodation_reservations;
create policy "Accommodation reservations readable by participants"
on public.accommodation_reservations
for select
to authenticated
using (
  auth.uid() = owner_id
  or auth.uid() = guest_id
  or public.is_admin_user(auth.uid())
);

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

  if v_existing_status in ('accepted', 'completed') then
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

  return v_reservation;
end;
$$;

grant execute on function public.guest_cancel_accommodation_reservation(uuid) to authenticated;
