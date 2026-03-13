-- Add helper RPCs for unread chat badges and read receipts.

create or replace function public.get_unread_messages_count()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  select count(*)::integer
  into v_count
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  where (c.client_id = auth.uid() or c.freelancer_id = auth.uid())
    and m.sender_id <> auth.uid()
    and m.read_at is null;

  return coalesce(v_count, 0);
end;
$$;

grant execute on function public.get_unread_messages_count() to authenticated;

create or replace function public.mark_conversation_messages_read(p_conversation_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if not exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and (c.client_id = auth.uid() or c.freelancer_id = auth.uid())
  ) then
    raise exception 'Not allowed to access this conversation';
  end if;

  update public.messages
  set read_at = now()
  where conversation_id = p_conversation_id
    and sender_id <> auth.uid()
    and read_at is null;

  get diagnostics v_updated = row_count;
  return coalesce(v_updated, 0);
end;
$$;

grant execute on function public.mark_conversation_messages_read(uuid) to authenticated;
