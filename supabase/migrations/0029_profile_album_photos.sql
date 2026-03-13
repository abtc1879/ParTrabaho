-- Profile album photos: public gallery per user.

create table public.profile_album_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  photo_url text not null,
  caption text,
  created_at timestamptz not null default now()
);

create index idx_profile_album_photos_user_created
on public.profile_album_photos(user_id, created_at desc);

alter table public.profile_album_photos enable row level security;

drop policy if exists "Album photos readable by authenticated users" on public.profile_album_photos;
create policy "Album photos readable by authenticated users"
on public.profile_album_photos
for select
to authenticated
using (true);

drop policy if exists "Users add own album photos" on public.profile_album_photos;
create policy "Users add own album photos"
on public.profile_album_photos
for insert
to authenticated
with check (auth.uid() = user_id and not public.is_user_restricted(auth.uid()));

drop policy if exists "Users update own album photos" on public.profile_album_photos;
create policy "Users update own album photos"
on public.profile_album_photos
for update
to authenticated
using (auth.uid() = user_id and not public.is_user_restricted(auth.uid()))
with check (auth.uid() = user_id and not public.is_user_restricted(auth.uid()));

drop policy if exists "Users delete own album photos" on public.profile_album_photos;
create policy "Users delete own album photos"
on public.profile_album_photos
for delete
to authenticated
using (auth.uid() = user_id and not public.is_user_restricted(auth.uid()));
