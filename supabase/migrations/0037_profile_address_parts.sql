-- Add structured address fields to profiles.

alter table public.profiles
  add column if not exists barangay text,
  add column if not exists city_municipality text,
  add column if not exists province text;
