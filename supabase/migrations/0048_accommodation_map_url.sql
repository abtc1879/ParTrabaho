-- Accommodation map link.

alter table public.accommodation_listings
  add column if not exists map_url text;
