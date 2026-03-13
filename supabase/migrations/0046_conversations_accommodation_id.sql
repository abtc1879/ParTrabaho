-- Add accommodation conversations.

alter table public.conversations
  add column if not exists accommodation_id uuid references public.accommodation_listings(id) on delete cascade;

create unique index if not exists conversations_accommodation_unique
on public.conversations(accommodation_id, client_id, freelancer_id)
where accommodation_id is not null;
