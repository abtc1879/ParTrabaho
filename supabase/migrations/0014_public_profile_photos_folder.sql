-- Public profile photo storage for cross-user profile viewing.
-- Uses bucket: profile-photos
-- Folder convention: public/<user_id>/avatar-<timestamp>.<ext>

insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', true)
on conflict (id) do update
set public = true;

drop policy if exists "Profile photos are publicly readable" on storage.objects;
create policy "Profile photos are publicly readable"
on storage.objects
for select
to public
using (bucket_id = 'profile-photos');

drop policy if exists "Users upload own profile photos in public folder" on storage.objects;
create policy "Users upload own profile photos in public folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = 'public'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "Users update own profile photos in public folder" on storage.objects;
create policy "Users update own profile photos in public folder"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = 'public'
  and (storage.foldername(name))[2] = auth.uid()::text
)
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = 'public'
  and (storage.foldername(name))[2] = auth.uid()::text
);

