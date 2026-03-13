-- Allow marketplace reviews to be visible to all users.

drop policy if exists "Marketplace reviews readable by participants" on public.marketplace_reviews;
drop policy if exists "Marketplace reviews readable by authenticated users" on public.marketplace_reviews;

create policy "Marketplace reviews readable by everyone"
on public.marketplace_reviews
for select
to public
using (true);
