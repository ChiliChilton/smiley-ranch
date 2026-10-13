-- Anyone in the family can add or rename equipment, like blinds. Admin still removes.
drop policy assets_insert on public.assets;
create policy assets_insert on public.assets for insert to authenticated
  with check (public.is_active_member() and created_by = public.current_member_id());
