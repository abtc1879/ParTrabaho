-- Accommodation room classifications + rates.

create table if not exists public.accommodation_room_rates (
  id uuid primary key default gen_random_uuid(),
  accommodation_id uuid not null references public.accommodation_listings(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  classification text not null,
  price_php numeric(12, 2) not null check (price_php >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_accommodation_room_rates_listing
  on public.accommodation_room_rates(accommodation_id, created_at desc);

alter table public.accommodation_room_rates enable row level security;

drop policy if exists "Accommodation room rates readable by authenticated users" on public.accommodation_room_rates;
create policy "Accommodation room rates readable by authenticated users"
  on public.accommodation_room_rates
  for select
  to authenticated
  using (true);

drop policy if exists "Owner can insert accommodation room rates" on public.accommodation_room_rates;
create policy "Owner can insert accommodation room rates"
  on public.accommodation_room_rates
  for insert
  to authenticated
  with check (auth.uid() = owner_id and not public.is_user_restricted(auth.uid()));

drop policy if exists "Owner can update accommodation room rates" on public.accommodation_room_rates;
create policy "Owner can update accommodation room rates"
  on public.accommodation_room_rates
  for update
  to authenticated
  using (auth.uid() = owner_id and not public.is_user_restricted(auth.uid()))
  with check (auth.uid() = owner_id and not public.is_user_restricted(auth.uid()));

drop policy if exists "Owner can delete accommodation room rates" on public.accommodation_room_rates;
create policy "Owner can delete accommodation room rates"
  on public.accommodation_room_rates
  for delete
  to authenticated
  using (auth.uid() = owner_id and not public.is_user_restricted(auth.uid()));
