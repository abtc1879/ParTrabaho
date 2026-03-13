-- Accommodation listing photos.

create table public.accommodation_listing_photos (
  id uuid primary key default gen_random_uuid(),
  accommodation_id uuid not null references public.accommodation_listings(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  photo_url text not null,
  created_at timestamptz not null default now()
);

create index idx_accommodation_listing_photos_listing_created
on public.accommodation_listing_photos(accommodation_id, created_at desc);

alter table public.accommodation_listing_photos enable row level security;

drop policy if exists "Accommodation listing photos readable by authenticated users" on public.accommodation_listing_photos;
create policy "Accommodation listing photos readable by authenticated users"
on public.accommodation_listing_photos
for select
to authenticated
using (true);

drop policy if exists "Owner inserts accommodation listing photos" on public.accommodation_listing_photos;
create policy "Owner inserts accommodation listing photos"
on public.accommodation_listing_photos
for insert
to authenticated
with check (auth.uid() = owner_id and not public.is_user_restricted(auth.uid()));

drop policy if exists "Owner deletes accommodation listing photos" on public.accommodation_listing_photos;
create policy "Owner deletes accommodation listing photos"
on public.accommodation_listing_photos
for delete
to authenticated
using (auth.uid() = owner_id and not public.is_user_restricted(auth.uid()));
