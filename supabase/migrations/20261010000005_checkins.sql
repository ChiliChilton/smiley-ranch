-- Back 40: who's on the place
--   checkins: "I'm here" with an optional "back by" time; "I'm out" closes it.
--   The not-back-by-dark push (Phase 6) reads open check-ins past expected_back.

create table public.checkins (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references public.members(id),
  arrived_at     timestamptz not null default now(),
  expected_back  timestamptz,
  note           text,
  left_at        timestamptz,
  left_by        uuid references public.members(id),
  created_by     uuid references public.members(id),
  created_at     timestamptz not null default now()
);

create index checkins_open_idx on public.checkins(member_id) where left_at is null;

create trigger checkins_set_created_by before insert on public.checkins
  for each row execute function public.set_created_by();

alter table public.checkins enable row level security;

create policy checkins_select on public.checkins for select to authenticated
  using (public.is_active_member());
create policy checkins_insert on public.checkins for insert to authenticated
  with check (public.is_active_member() and member_id = public.current_member_id());
create policy checkins_update on public.checkins for update to authenticated
  using (public.is_active_member() and (member_id = public.current_member_id() or public.is_admin()))
  with check (public.is_active_member() and (member_id = public.current_member_id() or public.is_admin()));

alter publication supabase_realtime add table public.checkins, public.comments;
