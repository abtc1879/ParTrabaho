-- App settings + branding logo storage bucket.

create table if not exists public.app_settings (
  id smallint primary key default 1,
  logo_url text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint app_settings_single_row check (id = 1)
);

drop trigger if exists set_app_settings_updated_at on public.app_settings;
create trigger set_app_settings_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;

drop policy if exists "Public read app settings" on public.app_settings;
create policy "Public read app settings"
on public.app_settings
for select
to public
using (true);

drop policy if exists "Admins insert app settings" on public.app_settings;
create policy "Admins insert app settings"
on public.app_settings
for insert
to authenticated
with check (public.is_admin_user(auth.uid()));

drop policy if exists "Admins update app settings" on public.app_settings;
create policy "Admins update app settings"
on public.app_settings
for update
to authenticated
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

insert into public.app_settings (id, logo_url)
values (1, '/brand/partrabaho-mark-4096.png')
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('app-assets', 'app-assets', true)
on conflict (id) do update
set public = true;

drop policy if exists "App assets are public" on storage.objects;
create policy "App assets are public"
on storage.objects
for select
to public
using (bucket_id = 'app-assets');

drop policy if exists "Admins upload app assets" on storage.objects;
create policy "Admins upload app assets"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'app-assets'
  and public.is_admin_user(auth.uid())
  and (storage.foldername(name))[1] = 'public'
);

drop policy if exists "Admins update app assets" on storage.objects;
create policy "Admins update app assets"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'app-assets'
  and public.is_admin_user(auth.uid())
  and (storage.foldername(name))[1] = 'public'
)
with check (
  bucket_id = 'app-assets'
  and public.is_admin_user(auth.uid())
  and (storage.foldername(name))[1] = 'public'
);

drop policy if exists "Admins delete app assets" on storage.objects;
create policy "Admins delete app assets"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'app-assets'
  and public.is_admin_user(auth.uid())
  and (storage.foldername(name))[1] = 'public'
);
