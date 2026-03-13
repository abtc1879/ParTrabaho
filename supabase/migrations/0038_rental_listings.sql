-- Rental listings.

create table public.rental_listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  category text not null,
  description text,
  price_php numeric(12, 2) not null check (price_php >= 0),
  location text not null,
  notes text,
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_rental_listings_updated_at
before update on public.rental_listings
for each row execute function public.set_updated_at();

create index idx_rental_listings_owner_created
on public.rental_listings(owner_id, created_at desc);

alter table public.rental_listings enable row level security;

drop policy if exists "Rental listings readable by authenticated users" on public.rental_listings;
create policy "Rental listings readable by authenticated users"
on public.rental_listings
for select
to authenticated
using (true);

drop policy if exists "Owner can insert rental listings" on public.rental_listings;
create policy "Owner can insert rental listings"
on public.rental_listings
for insert
to authenticated
with check (auth.uid() = owner_id and not public.is_user_restricted(auth.uid()));

drop policy if exists "Owner can update rental listings" on public.rental_listings;
create policy "Owner can update rental listings"
on public.rental_listings
for update
to authenticated
using (auth.uid() = owner_id and not public.is_user_restricted(auth.uid()))
with check (auth.uid() = owner_id and not public.is_user_restricted(auth.uid()));

drop policy if exists "Owner can delete rental listings" on public.rental_listings;
create policy "Owner can delete rental listings"
on public.rental_listings
for delete
to authenticated
using (auth.uid() = owner_id and not public.is_user_restricted(auth.uid()));
