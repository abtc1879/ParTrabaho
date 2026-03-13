-- Marketplace category and photo support.

alter table public.marketplace_products
  add column if not exists category text;

alter table public.marketplace_products
  add column if not exists photo_url text;

insert into storage.buckets (id, name, public)
values ('marketplace-photos', 'marketplace-photos', true)
on conflict (id) do update
set public = true;

drop policy if exists "Marketplace photos are public" on storage.objects;
create policy "Marketplace photos are public"
on storage.objects
for select
to public
using (bucket_id = 'marketplace-photos');

drop policy if exists "Users upload own marketplace photos in public folder" on storage.objects;
create policy "Users upload own marketplace photos in public folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'marketplace-photos'
  and (storage.foldername(name))[1] = 'public'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "Users update own marketplace photos in public folder" on storage.objects;
create policy "Users update own marketplace photos in public folder"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'marketplace-photos'
  and (storage.foldername(name))[1] = 'public'
  and (storage.foldername(name))[2] = auth.uid()::text
)
with check (
  bucket_id = 'marketplace-photos'
  and (storage.foldername(name))[1] = 'public'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "Users delete own marketplace photos in public folder" on storage.objects;
create policy "Users delete own marketplace photos in public folder"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'marketplace-photos'
  and (storage.foldername(name))[1] = 'public'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "Restricted users cannot upload marketplace photos" on storage.objects;
create policy "Restricted users cannot upload marketplace photos"
on storage.objects
as restrictive
for insert
to authenticated
with check (
  bucket_id <> 'marketplace-photos'
  or not public.is_user_restricted(auth.uid())
);

drop policy if exists "Restricted users cannot update marketplace photos" on storage.objects;
create policy "Restricted users cannot update marketplace photos"
on storage.objects
as restrictive
for update
to authenticated
using (
  bucket_id <> 'marketplace-photos'
  or not public.is_user_restricted(auth.uid())
)
with check (
  bucket_id <> 'marketplace-photos'
  or not public.is_user_restricted(auth.uid())
);

drop policy if exists "Restricted users cannot delete marketplace photos" on storage.objects;
create policy "Restricted users cannot delete marketplace photos"
on storage.objects
as restrictive
for delete
to authenticated
using (
  bucket_id <> 'marketplace-photos'
  or not public.is_user_restricted(auth.uid())
);
