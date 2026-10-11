-- Hunting seasons shown on the calendar. The admin keeps these current each
-- year from the TPWD Outdoor Annual; everyone can read them.

create table public.seasons (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 80),
  species     text not null default 'other' check (species in ('deer', 'turkey', 'dove', 'quail', 'other')),
  starts_on   date not null,
  ends_on     date not null check (ends_on >= starts_on),
  note        text check (note is null or length(note) <= 300),
  created_by  uuid references public.members(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index seasons_dates_idx on public.seasons(starts_on, ends_on) where deleted_at is null;

create trigger seasons_set_created_by before insert on public.seasons
  for each row execute function public.set_created_by();
create trigger seasons_set_updated_at before update on public.seasons
  for each row execute function public.set_updated_at();

alter table public.seasons enable row level security;

create policy seasons_select on public.seasons for select to authenticated
  using (public.is_active_member() and (deleted_at is null or public.is_admin()));
create policy seasons_insert on public.seasons for insert to authenticated
  with check (public.is_admin());
create policy seasons_update on public.seasons for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

alter publication supabase_realtime add table public.seasons;
