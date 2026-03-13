-- Marketplace receipts, reviews, and notifications.

alter type public.notification_type_t
  add value if not exists 'marketplace_update';

create table public.marketplace_receipts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.marketplace_products(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  received_at timestamptz not null default now(),
  unique (product_id, buyer_id)
);

create index idx_marketplace_receipts_seller_created
on public.marketplace_receipts(seller_id, received_at desc);

alter table public.marketplace_receipts enable row level security;

drop policy if exists "Marketplace receipts readable by participants" on public.marketplace_receipts;
create policy "Marketplace receipts readable by participants"
on public.marketplace_receipts
for select
to authenticated
using (auth.uid() = buyer_id or auth.uid() = seller_id);

drop policy if exists "Buyer inserts marketplace receipts" on public.marketplace_receipts;
create policy "Buyer inserts marketplace receipts"
on public.marketplace_receipts
for insert
to authenticated
with check (
  auth.uid() = buyer_id
  and not public.is_user_restricted(auth.uid())
  and exists (
    select 1
    from public.marketplace_products p
    where p.id = product_id
      and p.seller_id = seller_id
  )
);

create table public.marketplace_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.marketplace_products(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  stars integer not null check (stars between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (product_id, buyer_id)
);

create index idx_marketplace_reviews_seller_created
on public.marketplace_reviews(seller_id, created_at desc);

alter table public.marketplace_reviews enable row level security;

drop policy if exists "Marketplace reviews readable by participants" on public.marketplace_reviews;
create policy "Marketplace reviews readable by participants"
on public.marketplace_reviews
for select
to authenticated
using (auth.uid() = buyer_id or auth.uid() = seller_id);

drop policy if exists "Buyer inserts marketplace reviews" on public.marketplace_reviews;
create policy "Buyer inserts marketplace reviews"
on public.marketplace_reviews
for insert
to authenticated
with check (auth.uid() = buyer_id and not public.is_user_restricted(auth.uid()));

create or replace function public.mark_marketplace_received(p_product_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer_id uuid;
  v_seller_id uuid;
  v_receipt_id uuid;
  v_buyer_name text;
begin
  v_buyer_id := auth.uid();
  if v_buyer_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.assert_user_not_restricted(v_buyer_id);

  select seller_id
  into v_seller_id
  from public.marketplace_products
  where id = p_product_id;

  if v_seller_id is null then
    raise exception 'Product not found';
  end if;

  if v_buyer_id = v_seller_id then
    raise exception 'You cannot receive your own product';
  end if;

  if not exists (
    select 1
    from public.conversations c
    where c.product_id = p_product_id
      and c.freelancer_id = v_buyer_id
  ) then
    raise exception 'You are not allowed to mark this product as received';
  end if;

  insert into public.marketplace_receipts (product_id, buyer_id, seller_id)
  values (p_product_id, v_buyer_id, v_seller_id)
  on conflict (product_id, buyer_id) do nothing
  returning id into v_receipt_id;

  if v_receipt_id is null then
    select id
    into v_receipt_id
    from public.marketplace_receipts
    where product_id = p_product_id
      and buyer_id = v_buyer_id;

    return v_receipt_id;
  end if;

  select concat_ws(' ', firstname, surname)
  into v_buyer_name
  from public.profiles
  where id = v_buyer_id;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_seller_id,
    'marketplace_update',
    'Product Received',
    coalesce(nullif(v_buyer_name, ''), 'A buyer') || ' marked your product as received.',
    jsonb_build_object(
      'product_id', p_product_id,
      'buyer_id', v_buyer_id
    )
  );

  return v_receipt_id;
end;
$$;

grant execute on function public.mark_marketplace_received(uuid) to authenticated;

create or replace function public.submit_marketplace_review(
  p_product_id uuid,
  p_stars integer,
  p_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer_id uuid;
  v_seller_id uuid;
  v_review_id uuid;
begin
  v_buyer_id := auth.uid();
  if v_buyer_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.assert_user_not_restricted(v_buyer_id);

  if p_stars < 1 or p_stars > 5 then
    raise exception 'Stars must be between 1 and 5';
  end if;

  select seller_id
  into v_seller_id
  from public.marketplace_products
  where id = p_product_id;

  if v_seller_id is null then
    raise exception 'Product not found';
  end if;

  if v_buyer_id = v_seller_id then
    raise exception 'You cannot rate yourself';
  end if;

  if not exists (
    select 1
    from public.marketplace_receipts r
    where r.product_id = p_product_id
      and r.buyer_id = v_buyer_id
  ) then
    raise exception 'You must mark the product as received before rating';
  end if;

  if exists (
    select 1
    from public.marketplace_reviews r
    where r.product_id = p_product_id
      and r.buyer_id = v_buyer_id
  ) then
    raise exception 'You already rated this seller for this product';
  end if;

  insert into public.marketplace_reviews (product_id, buyer_id, seller_id, stars, comment)
  values (p_product_id, v_buyer_id, v_seller_id, p_stars, p_comment)
  returning id into v_review_id;

  update public.profiles
  set rating_count = rating_count + 1,
      rating_avg = round(((rating_avg * rating_count + p_stars)::numeric / (rating_count + 1)), 1)
  where id = v_seller_id;

  return v_review_id;
end;
$$;

grant execute on function public.submit_marketplace_review(uuid, integer, text) to authenticated;
