-- Pinned property notes, and needs or projects tied to a trip.
alter table public.log_entries add column pinned boolean not null default false;
alter table public.supply_items add column event_id uuid references public.events(id);
alter table public.todos add column event_id uuid references public.events(id);
create index supply_items_event_idx on public.supply_items(event_id) where deleted_at is null and needed;
create index todos_event_idx on public.todos(event_id) where deleted_at is null and status = 'open';
