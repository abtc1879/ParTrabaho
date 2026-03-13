alter table public.rental_listings
add column if not exists map_url text;
