-- Enforce full suspension restrictions:
-- suspended/blocked users cannot edit profile info or profile photos,
-- and cannot submit report transactions directly.

drop policy if exists "Restricted users cannot update profiles" on public.profiles;
create policy "Restricted users cannot update profiles"
on public.profiles
as restrictive
for update
to authenticated
using (not public.is_user_restricted(auth.uid()))
with check (not public.is_user_restricted(auth.uid()));

drop policy if exists "Restricted users cannot insert profiles" on public.profiles;
create policy "Restricted users cannot insert profiles"
on public.profiles
as restrictive
for insert
to authenticated
with check (not public.is_user_restricted(auth.uid()));

drop policy if exists "Restricted users cannot insert reports" on public.user_reports;
create policy "Restricted users cannot insert reports"
on public.user_reports
as restrictive
for insert
to authenticated
with check (not public.is_user_restricted(auth.uid()));

-- Block profile photo uploads/edits/deletes for suspended/blocked users.
drop policy if exists "Restricted users cannot upload profile photos" on storage.objects;
create policy "Restricted users cannot upload profile photos"
on storage.objects
as restrictive
for insert
to authenticated
with check (
  bucket_id not in ('avatars', 'profile-photos')
  or not public.is_user_restricted(auth.uid())
);

drop policy if exists "Restricted users cannot update profile photos" on storage.objects;
create policy "Restricted users cannot update profile photos"
on storage.objects
as restrictive
for update
to authenticated
using (
  bucket_id not in ('avatars', 'profile-photos')
  or not public.is_user_restricted(auth.uid())
)
with check (
  bucket_id not in ('avatars', 'profile-photos')
  or not public.is_user_restricted(auth.uid())
);

drop policy if exists "Restricted users cannot delete profile photos" on storage.objects;
create policy "Restricted users cannot delete profile photos"
on storage.objects
as restrictive
for delete
to authenticated
using (
  bucket_id not in ('avatars', 'profile-photos')
  or not public.is_user_restricted(auth.uid())
);
