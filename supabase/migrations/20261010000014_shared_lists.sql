-- Needs and projects are shared lists: anyone in the family can mark a need "Got it"
-- or a project "Done", not just whoever added it. (Notes, harvests, and the rest stay
-- owner-or-admin.) Removing is still only shown to the owner or the admin in the app.
drop policy if exists todos_update on public.todos;
create policy todos_update on public.todos for update to authenticated
  using (public.is_active_member())
  with check (public.is_active_member());

drop policy if exists supply_items_update on public.supply_items;
create policy supply_items_update on public.supply_items for update to authenticated
  using (public.is_active_member())
  with check (public.is_active_member());
