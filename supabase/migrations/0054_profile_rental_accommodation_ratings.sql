-- Rental + accommodation ratings on profiles.

alter table public.profiles
  add column if not exists rental_rating_avg numeric(2, 1) not null default 0,
  add column if not exists rental_rating_count integer not null default 0,
  add column if not exists accommodation_rating_avg numeric(2, 1) not null default 0,
  add column if not exists accommodation_rating_count integer not null default 0;

with rental_stats as (
  select owner_id, count(*) as review_count, avg(stars)::numeric(10, 2) as avg_stars
  from public.rental_reviews
  group by owner_id
)
update public.profiles p
set rental_rating_count = coalesce(r.review_count, 0),
    rental_rating_avg = coalesce(round(r.avg_stars, 1), 0)
from rental_stats r
where p.id = r.owner_id;

create or replace function public.submit_rental_review(
  p_reservation_id uuid,
  p_stars integer,
  p_comment text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_reviewer_id uuid;
  v_owner_id uuid;
  v_rental_id uuid;
  v_status public.rental_reservation_status_t;
  v_review_id uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'Not authenticated';
  end if;

  perform public.assert_user_not_restricted(v_actor_id);

  if p_stars < 1 or p_stars > 5 then
    raise exception 'Stars must be between 1 and 5';
  end if;

  select renter_id, owner_id, rental_id, status
  into v_reviewer_id, v_owner_id, v_rental_id, v_status
  from public.rental_reservations
  where id = p_reservation_id;

  if v_owner_id is null then
    raise exception 'Reservation not found';
  end if;

  if v_actor_id <> v_reviewer_id then
    raise exception 'You are not allowed to rate this reservation';
  end if;

  if v_status <> 'completed' then
    raise exception 'Reservation must be completed before rating';
  end if;

  if exists (
    select 1
    from public.rental_reviews r
    where r.reservation_id = p_reservation_id
      and r.reviewer_id = v_actor_id
  ) then
    raise exception 'You already submitted a rating for this reservation';
  end if;

  insert into public.rental_reviews (
    reservation_id,
    rental_id,
    reviewer_id,
    owner_id,
    stars,
    comment
  )
  values (
    p_reservation_id,
    v_rental_id,
    v_actor_id,
    v_owner_id,
    p_stars,
    p_comment
  )
  returning id into v_review_id;

  update public.profiles
  set rating_count = rating_count + 1,
      rating_avg = round(((rating_avg * rating_count + p_stars)::numeric / (rating_count + 1)), 1),
      rental_rating_count = rental_rating_count + 1,
      rental_rating_avg = round(((rental_rating_avg * rental_rating_count + p_stars)::numeric / (rental_rating_count + 1)), 1)
  where id = v_owner_id;

  return v_review_id;
end;
$$;

grant execute on function public.submit_rental_review(uuid, integer, text) to authenticated;
