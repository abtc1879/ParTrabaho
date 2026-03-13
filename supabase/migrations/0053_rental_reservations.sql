-- Rental reservations + reviews.

alter type public.notification_type_t
  add value if not exists 'rental_reservation';

alter type public.notification_type_t
  add value if not exists 'rental_update';

alter table public.rental_listings
  add column if not exists is_reserved boolean not null default false;

do $$
begin
  create type public.rental_reservation_status_t as enum ('pending', 'accepted', 'cancelled', 'completed');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.rental_reservations (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.rental_listings(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  renter_id uuid not null references public.profiles(id) on delete cascade,
  days integer not null check (days > 0),
  include_driver boolean not null default false,
  status public.rental_reservation_status_t not null default 'pending',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rental_id, renter_id)
);

create unique index if not exists idx_rental_reservations_active_unique
  on public.rental_reservations(rental_id)
  where status in ('pending', 'accepted');

create index if not exists idx_rental_reservations_owner_created
  on public.rental_reservations(owner_id, created_at desc);

create index if not exists idx_rental_reservations_renter_created
  on public.rental_reservations(renter_id, created_at desc);

drop trigger if exists set_rental_reservations_updated_at on public.rental_reservations;
create trigger set_rental_reservations_updated_at
before update on public.rental_reservations
for each row execute function public.set_updated_at();

alter table public.rental_reservations enable row level security;

drop policy if exists "Rental reservations readable by participants" on public.rental_reservations;
create policy "Rental reservations readable by participants"
on public.rental_reservations
for select
to authenticated
using (
  auth.uid() = owner_id
  or auth.uid() = renter_id
  or public.is_admin_user(auth.uid())
);

create table if not exists public.rental_reviews (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.rental_reservations(id) on delete cascade,
  rental_id uuid not null references public.rental_listings(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  stars integer not null check (stars between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (reservation_id, reviewer_id)
);

create index if not exists idx_rental_reviews_owner_created
  on public.rental_reviews(owner_id, created_at desc);

alter table public.rental_reviews enable row level security;

drop policy if exists "Rental reviews readable by participants" on public.rental_reviews;
create policy "Rental reviews readable by participants"
on public.rental_reviews
for select
to authenticated
using (
  auth.uid() = reviewer_id
  or auth.uid() = owner_id
  or public.is_admin_user(auth.uid())
);

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

  select owner_id, title, is_reserved
  into v_owner_id, v_rental_title, v_is_reserved
  from public.rental_listings
  where id = p_rental_id;

  if v_owner_id is null then
    raise exception 'Rental not found';
  end if;

  if v_owner_id = v_renter_id then
    raise exception 'You cannot reserve your own rental';
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
    set is_reserved = false
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

create or replace function public.renter_update_rental_reservation(
  p_reservation_id uuid,
  p_days integer,
  p_include_driver boolean default false
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

  if p_days is null or p_days < 1 then
    raise exception 'Days must be at least 1';
  end if;

  select renter_id, owner_id, rental_id, status
  into v_renter_id, v_owner_id, v_rental_id, v_status
  from public.rental_reservations
  where id = p_reservation_id;

  if v_owner_id is null then
    raise exception 'Reservation not found';
  end if;

  if v_actor_id <> v_renter_id then
    raise exception 'You are not allowed to update this reservation';
  end if;

  if v_status not in ('cancelled', 'pending') then
    raise exception 'Reservation cannot be edited right now';
  end if;

  update public.rental_reservations
  set days = p_days,
      include_driver = coalesce(p_include_driver, false),
      status = 'pending'
  where id = p_reservation_id
  returning * into v_reservation;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_owner_id,
    'rental_update',
    'Reservation Updated',
    'Reservation details were updated. Please review the new request.',
    jsonb_build_object('rental_id', v_rental_id, 'reservation_id', p_reservation_id, 'status', v_reservation.status)
  );

  return v_reservation;
end;
$$;

grant execute on function public.renter_update_rental_reservation(uuid, integer, boolean) to authenticated;

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
  set is_reserved = false
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

create or replace function public.submit_rental_review(
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
  v_reviewer_id uuid;
  v_owner_id uuid;
  v_rental_id uuid;
  v_status public.rental_reservation_status_t;
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

  select renter_id, owner_id, rental_id, status
  into v_reviewer_id, v_owner_id, v_rental_id, v_status
  from public.rental_reservations
  where id = p_reservation_id;

  if v_owner_id is null then
    raise exception 'Reservation not found';
  end if;

  if v_actor_id <> v_reviewer_id then
    raise exception 'You are not allowed to rate this reservation';
  end if;

  if v_status <> 'completed' then
    raise exception 'Reservation must be completed before rating';
  end if;

  if exists (
    select 1
    from public.rental_reviews r
    where r.reservation_id = p_reservation_id
      and r.reviewer_id = v_actor_id
  ) then
    raise exception 'You already submitted a rating for this reservation';
  end if;

  insert into public.rental_reviews (
    reservation_id,
    rental_id,
    reviewer_id,
    owner_id,
    stars,
    comment
  )
  values (
    p_reservation_id,
    v_rental_id,
    v_actor_id,
    v_owner_id,
    p_stars,
    p_comment
  )
  returning id into v_review_id;

  update public.profiles
  set rating_count = rating_count + 1,
      rating_avg = round(((rating_avg * rating_count + p_stars)::numeric / (rating_count + 1)), 1)
  where id = v_owner_id;

  return v_review_id;
end;
$$;

grant execute on function public.submit_rental_review(uuid, integer, text) to authenticated;
