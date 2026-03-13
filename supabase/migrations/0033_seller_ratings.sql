-- Seller ratings for marketplace reviews.

alter table public.profiles
  add column if not exists seller_rating_avg numeric(2, 1) not null default 0,
  add column if not exists seller_rating_count integer not null default 0;

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
      rating_avg = round(((rating_avg * rating_count + p_stars)::numeric / (rating_count + 1)), 1),
      seller_rating_count = seller_rating_count + 1,
      seller_rating_avg = round(((seller_rating_avg * seller_rating_count + p_stars)::numeric / (seller_rating_count + 1)), 1)
  where id = v_seller_id;

  return v_review_id;
end;
$$;

grant execute on function public.submit_marketplace_review(uuid, integer, text) to authenticated;
