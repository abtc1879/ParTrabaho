-- Allow users to delete their own notifications.
create policy "User deletes own notifications"
on public.notifications
for delete
to authenticated
using (auth.uid() = user_id);
