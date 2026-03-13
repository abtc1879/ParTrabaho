-- Allow chat participants to delete their conversation.
-- Deleting a conversation will cascade delete messages via FK.

drop policy if exists "Conversation delete by participants" on public.conversations;

create policy "Conversation delete by participants"
on public.conversations
for delete
to authenticated
using (auth.uid() = client_id or auth.uid() = freelancer_id);
