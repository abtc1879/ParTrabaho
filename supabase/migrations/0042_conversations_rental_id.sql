-- Add rental conversations.

alter table public.conversations
  add column if not exists rental_id uuid references public.rental_listings(id) on delete cascade;

create unique index if not exists conversations_rental_unique
on public.conversations(rental_id, client_id, freelancer_id)
where rental_id is not null;
