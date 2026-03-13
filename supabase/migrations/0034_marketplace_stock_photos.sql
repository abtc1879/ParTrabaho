-- Marketplace stock and multiple photos.

alter table public.marketplace_products
  add column if not exists stock integer not null default 1;

alter table public.marketplace_products
  add constraint marketplace_products_stock_check
  check (stock >= 0);

create table public.marketplace_product_photos (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.marketplace_products(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  photo_url text not null,
  created_at timestamptz not null default now()
);

create index idx_marketplace_product_photos_product_created
on public.marketplace_product_photos(product_id, created_at desc);

alter table public.marketplace_product_photos enable row level security;

drop policy if exists "Marketplace product photos readable by authenticated users" on public.marketplace_product_photos;
create policy "Marketplace product photos readable by authenticated users"
on public.marketplace_product_photos
for select
to authenticated
using (true);

drop policy if exists "Seller inserts marketplace product photos" on public.marketplace_product_photos;
create policy "Seller inserts marketplace product photos"
on public.marketplace_product_photos
for insert
to authenticated
with check (auth.uid() = seller_id and not public.is_user_restricted(auth.uid()));

drop policy if exists "Seller deletes marketplace product photos" on public.marketplace_product_photos;
create policy "Seller deletes marketplace product photos"
on public.marketplace_product_photos
for delete
to authenticated
using (auth.uid() = seller_id and not public.is_user_restricted(auth.uid()));
