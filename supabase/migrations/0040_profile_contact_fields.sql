-- Optional profile contact fields.

alter table public.profiles
  add column if not exists email text;

alter table public.profiles
  add column if not exists contact_number text;
