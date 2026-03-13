-- Marketplace orders, sold out status, and stock decrement.

alter table public.marketplace_products
  add column if not exists sold_out boolean not null default false;

create table public.marketplace_orders (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.marketplace_products(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now()
);

create index idx_marketplace_orders_seller_created
on public.marketplace_orders(seller_id, created_at desc);

alter table public.marketplace_orders enable row level security;

drop policy if exists "Marketplace orders readable by participants" on public.marketplace_orders;
create policy "Marketplace orders readable by participants"
on public.marketplace_orders
for select
to authenticated
using (auth.uid() = buyer_id or auth.uid() = seller_id);

drop policy if exists "Buyer inserts marketplace orders" on public.marketplace_orders;
create policy "Buyer inserts marketplace orders"
on public.marketplace_orders
for insert
to authenticated
with check (auth.uid() = buyer_id and not public.is_user_restricted(auth.uid()));

create or replace function public.place_marketplace_order(
  p_product_id uuid,
  p_quantity integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer_id uuid;
  v_seller_id uuid;
  v_stock integer;
  v_order_id uuid;
  v_remaining integer;
  v_buyer_name text;
begin
  v_buyer_id := auth.uid();
  if v_buyer_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.assert_user_not_restricted(v_buyer_id);

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be at least 1';
  end if;

  select seller_id, stock
  into v_seller_id, v_stock
  from public.marketplace_products
  where id = p_product_id
  for update;

  if v_seller_id is null then
    raise exception 'Product not found';
  end if;

  if v_buyer_id = v_seller_id then
    raise exception 'You cannot buy your own product';
  end if;

  if v_stock is null or v_stock < p_quantity then
    raise exception 'Insufficient stock';
  end if;

  v_remaining := v_stock - p_quantity;

  update public.marketplace_products
  set stock = v_remaining,
      sold_out = (v_remaining <= 0)
  where id = p_product_id;

  insert into public.marketplace_orders (product_id, buyer_id, seller_id, quantity)
  values (p_product_id, v_buyer_id, v_seller_id, p_quantity)
  returning id into v_order_id;

  select concat_ws(' ', firstname, surname)
  into v_buyer_name
  from public.profiles
  where id = v_buyer_id;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_seller_id,
    'marketplace_update',
    'Product Sold',
    coalesce(nullif(v_buyer_name, ''), 'A buyer') || ' ordered ' || p_quantity || ' item(s) from your listing.',
    jsonb_build_object(
      'product_id', p_product_id,
      'buyer_id', v_buyer_id,
      'quantity', p_quantity,
      'remaining_stock', v_remaining
    )
  );

  return v_order_id;
end;
$$;

grant execute on function public.place_marketplace_order(uuid, integer) to authenticated;
