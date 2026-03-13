-- Rental + accommodation review visibility + accommodation reviews table.

drop policy if exists "Rental reviews readable by participants" on public.rental_reviews;
drop policy if exists "Rental reviews readable by authenticated users" on public.rental_reviews;

create policy "Rental reviews readable by everyone"
on public.rental_reviews
for select
to public
using (true);

create table if not exists public.accommodation_reviews (
  id uuid primary key default gen_random_uuid(),
  accommodation_id uuid not null references public.accommodation_listings(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  stars integer not null check (stars between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (accommodation_id, reviewer_id)
);

create index if not exists idx_accommodation_reviews_owner_created
on public.accommodation_reviews(owner_id, created_at desc);

alter table public.accommodation_reviews enable row level security;

drop policy if exists "Accommodation reviews readable by everyone" on public.accommodation_reviews;
create policy "Accommodation reviews readable by everyone"
on public.accommodation_reviews
for select
to public
using (true);

with accommodation_stats as (
  select owner_id, count(*) as review_count, avg(stars)::numeric(10, 2) as avg_stars
  from public.accommodation_reviews
  group by owner_id
)
update public.profiles p
set accommodation_rating_count = coalesce(r.review_count, 0),
    accommodation_rating_avg = coalesce(round(r.avg_stars, 1), 0)
from accommodation_stats r
where p.id = r.owner_id;
