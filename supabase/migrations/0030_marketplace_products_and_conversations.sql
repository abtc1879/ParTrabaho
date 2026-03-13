-- Marketplace products and chat conversations.

create table public.marketplace_products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  specification text,
  price_php numeric(12, 2) not null check (price_php >= 0),
  location text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_marketplace_products_updated_at
before update on public.marketplace_products
for each row execute function public.set_updated_at();

create index idx_marketplace_products_seller_created
on public.marketplace_products(seller_id, created_at desc);

alter table public.marketplace_products enable row level security;

drop policy if exists "Marketplace products readable by authenticated users" on public.marketplace_products;
create policy "Marketplace products readable by authenticated users"
on public.marketplace_products
for select
to authenticated
using (true);

drop policy if exists "Seller can insert marketplace products" on public.marketplace_products;
create policy "Seller can insert marketplace products"
on public.marketplace_products
for insert
to authenticated
with check (auth.uid() = seller_id and not public.is_user_restricted(auth.uid()));

drop policy if exists "Seller can update marketplace products" on public.marketplace_products;
create policy "Seller can update marketplace products"
on public.marketplace_products
for update
to authenticated
using (auth.uid() = seller_id and not public.is_user_restricted(auth.uid()))
with check (auth.uid() = seller_id and not public.is_user_restricted(auth.uid()));

drop policy if exists "Seller can delete marketplace products" on public.marketplace_products;
create policy "Seller can delete marketplace products"
on public.marketplace_products
for delete
to authenticated
using (auth.uid() = seller_id and not public.is_user_restricted(auth.uid()));

alter table public.conversations
  add column if not exists product_id uuid references public.marketplace_products(id) on delete cascade;

alter table public.conversations
  alter column job_id drop not null;

alter table public.conversations
  drop constraint if exists conversations_job_id_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'conversations_job_id_key'
  ) then
    alter table public.conversations
      add constraint conversations_job_id_key unique (job_id);
  end if;
end $$;

create unique index if not exists conversations_marketplace_unique
on public.conversations(product_id, client_id, freelancer_id)
where product_id is not null;
