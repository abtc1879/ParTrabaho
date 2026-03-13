-- Chat media storage for photo sharing.
-- Bucket: chat-media
-- Folder convention: public/<user_id>/<conversation_id>/chat-<timestamp>.<ext>

insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', true)
on conflict (id) do update
set public = true;

drop policy if exists "Chat media is publicly readable" on storage.objects;
create policy "Chat media is publicly readable"
on storage.objects
for select
to public
using (bucket_id = 'chat-media');

drop policy if exists "Users upload own chat media in public folder" on storage.objects;
create policy "Users upload own chat media in public folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[1] = 'public'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "Users update own chat media in public folder" on storage.objects;
create policy "Users update own chat media in public folder"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[1] = 'public'
  and (storage.foldername(name))[2] = auth.uid()::text
)
with check (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[1] = 'public'
  and (storage.foldername(name))[2] = auth.uid()::text
);
