-- Rental listing photos.

create table public.rental_listing_photos (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.rental_listings(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  photo_url text not null,
  created_at timestamptz not null default now()
);

create index idx_rental_listing_photos_rental_created
on public.rental_listing_photos(rental_id, created_at desc);

alter table public.rental_listing_photos enable row level security;

drop policy if exists "Rental listing photos readable by authenticated users" on public.rental_listing_photos;
create policy "Rental listing photos readable by authenticated users"
on public.rental_listing_photos
for select
to authenticated
using (true);

drop policy if exists "Owner inserts rental listing photos" on public.rental_listing_photos;
create policy "Owner inserts rental listing photos"
on public.rental_listing_photos
for insert
to authenticated
with check (auth.uid() = owner_id and not public.is_user_restricted(auth.uid()));

drop policy if exists "Owner deletes rental listing photos" on public.rental_listing_photos;
create policy "Owner deletes rental listing photos"
on public.rental_listing_photos
for delete
to authenticated
using (auth.uid() = owner_id and not public.is_user_restricted(auth.uid()));
