-- Accommodation price range support.

alter table public.accommodation_listings
  add column if not exists price_min_php numeric(12, 2);

alter table public.accommodation_listings
  add column if not exists price_max_php numeric(12, 2);

alter table public.accommodation_listings
  add constraint accommodation_price_min_check
  check (price_min_php is null or price_min_php >= 0);

alter table public.accommodation_listings
  add constraint accommodation_price_max_check
  check (price_max_php is null or price_max_php >= 0);

alter table public.accommodation_listings
  add constraint accommodation_price_range_check
  check (
    price_min_php is null
    or price_max_php is null
    or price_max_php >= price_min_php
  );

update public.accommodation_listings
set
  price_min_php = coalesce(price_min_php, price_php),
  price_max_php = coalesce(price_max_php, price_php);
