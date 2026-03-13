-- Rental photos storage bucket.

insert into storage.buckets (id, name, public)
values ('rental-photos', 'rental-photos', true)
on conflict (id) do update
set public = true;

drop policy if exists "Rental photos are public" on storage.objects;
create policy "Rental photos are public"
on storage.objects
for select
to public
using (bucket_id = 'rental-photos');

drop policy if exists "Users upload own rental photos in public folder" on storage.objects;
create policy "Users upload own rental photos in public folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'rental-photos'
  and (storage.foldername(name))[1] = 'public'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "Users update own rental photos in public folder" on storage.objects;
create policy "Users update own rental photos in public folder"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'rental-photos'
  and (storage.foldername(name))[1] = 'public'
  and (storage.foldername(name))[2] = auth.uid()::text
)
with check (
  bucket_id = 'rental-photos'
  and (storage.foldername(name))[1] = 'public'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "Users delete own rental photos in public folder" on storage.objects;
create policy "Users delete own rental photos in public folder"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'rental-photos'
  and (storage.foldername(name))[1] = 'public'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "Restricted users cannot upload rental photos" on storage.objects;
create policy "Restricted users cannot upload rental photos"
on storage.objects
as restrictive
for insert
to authenticated
with check (
  bucket_id <> 'rental-photos'
  or not public.is_user_restricted(auth.uid())
);

drop policy if exists "Restricted users cannot update rental photos" on storage.objects;
create policy "Restricted users cannot update rental photos"
on storage.objects
as restrictive
for update
to authenticated
using (
  bucket_id <> 'rental-photos'
  or not public.is_user_restricted(auth.uid())
)
with check (
  bucket_id <> 'rental-photos'
  or not public.is_user_restricted(auth.uid())
);

drop policy if exists "Restricted users cannot delete rental photos" on storage.objects;
create policy "Restricted users cannot delete rental photos"
on storage.objects
as restrictive
for delete
to authenticated
using (
  bucket_id <> 'rental-photos'
  or not public.is_user_restricted(auth.uid())
);
