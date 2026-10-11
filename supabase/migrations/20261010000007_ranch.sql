-- Ranch info, equipment, blinds with feeders, and trip headcounts.
--   * info_items: gate code, Wi-Fi, shutoffs, contacts. Admin edits, everyone reads.
--   * assets: the house, trailer, truck, tractor, ATVs. Anyone can set status and note;
--     admin adds and removes. Needs and projects can point at one (replaces the
--     House / Trailer / Barn place tag).
--   * pins.has_feeder: a blind that has its own feeder (fills attach to the blind).
--   * event_attendees.headcount: how many are coming with you.
--   * settings.beds: how many beds the place sleeps.

-- ---------------------------------------------------------------------------
-- Ranch info
-- ---------------------------------------------------------------------------
create table public.info_items (
  id          uuid primary key default gen_random_uuid(),
  section     text not null check (section in ('access', 'house', 'utilities', 'contacts')),
  label       text not null check (length(btrim(label)) between 1 and 80),
  value       text not null default '' check (length(value) <= 1000),
  sort_order  integer not null default 0,
  created_by  uuid references public.members(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create trigger info_items_set_created_by before insert on public.info_items
  for each row execute function public.set_created_by();
create trigger info_items_set_updated_at before update on public.info_items
  for each row execute function public.set_updated_at();

alter table public.info_items enable row level security;
create policy info_items_select on public.info_items for select to authenticated
  using (public.is_active_member() and (deleted_at is null or public.is_admin()));
create policy info_items_insert on public.info_items for insert to authenticated
  with check (public.is_admin());
create policy info_items_update on public.info_items for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Equipment and places
-- ---------------------------------------------------------------------------
create table public.assets (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 60),
  kind        text not null default 'other' check (kind in ('building', 'vehicle', 'atv', 'tractor', 'trailer', 'other')),
  status      text not null default 'good' check (status in ('good', 'attention', 'down')),
  note        text check (note is null or length(note) <= 500),
  sort_order  integer not null default 0,
  created_by  uuid references public.members(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create trigger assets_set_created_by before insert on public.assets
  for each row execute function public.set_created_by();
create trigger assets_set_updated_at before update on public.assets
  for each row execute function public.set_updated_at();

alter table public.assets enable row level security;
create policy assets_select on public.assets for select to authenticated
  using (public.is_active_member() and (deleted_at is null or public.is_admin()));
create policy assets_insert on public.assets for insert to authenticated
  with check (public.is_admin());
-- Anyone in the family can flag a machine as down or leave a note; only the admin
-- renames or removes (enforced in the app; the row stays theirs to read either way).
create policy assets_update on public.assets for update to authenticated
  using (public.is_active_member()) with check (public.is_active_member());

-- The three places the old tag knew about, so existing needs keep their tag.
insert into public.assets (id, name, kind, sort_order) values
  ('00000000-0000-4000-8000-000000000a01', 'House', 'building', 1),
  ('00000000-0000-4000-8000-000000000a02', 'House trailer', 'building', 2),
  ('00000000-0000-4000-8000-000000000a03', 'Barn', 'building', 3);

alter table public.supply_items add column asset_id uuid references public.assets(id);
update public.supply_items set asset_id = case place
  when 'house' then '00000000-0000-4000-8000-000000000a01'::uuid
  when 'trailer' then '00000000-0000-4000-8000-000000000a02'::uuid
  when 'barn' then '00000000-0000-4000-8000-000000000a03'::uuid end
  where place is not null;
alter table public.supply_items drop column place;

alter table public.todos add column asset_id uuid references public.assets(id);

create index supply_items_asset_idx on public.supply_items(asset_id) where deleted_at is null;
create index todos_asset_idx on public.todos(asset_id) where deleted_at is null and status = 'open';

-- ---------------------------------------------------------------------------
-- Blinds with feeders
-- ---------------------------------------------------------------------------
alter table public.pins add column has_feeder boolean not null default false;
update public.pins set has_feeder = true where type = 'feeder';
-- Feeder settings are allowed on anything that has a feeder, not just feeder pins.
alter table public.pins drop constraint pins_fill_interval_only_for_feeders;
alter table public.pins drop constraint pins_days_per_bag_only_for_feeders;
alter table public.pins add constraint pins_fill_interval_only_for_feeders
  check (fill_interval_days is null or type = 'feeder' or has_feeder);
alter table public.pins add constraint pins_days_per_bag_only_for_feeders
  check (days_per_bag is null or type = 'feeder' or has_feeder);

-- ---------------------------------------------------------------------------
-- Headcount on trips, beds at the place
-- ---------------------------------------------------------------------------
alter table public.event_attendees add column headcount integer not null default 1 check (headcount between 1 and 30);
insert into public.settings (key, value) values ('beds', '4') on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Feeder digest: stands with feeders count too, and the link goes to Blinds.
-- ---------------------------------------------------------------------------
create or replace function public.push_feeders_overdue() returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_list text;
begin
  select string_agg(name || ' (' || note || ')', ', ' order by sort_key) into v_list
  from (
    select p.name,
           case
             when lf.bags is not null and p.days_per_bag is not null then
               case when lf.filled_at + make_interval(days => (lf.bags * p.days_per_bag)::int) < now()
                    then 'empty' else 'runs out ' || to_char(lf.filled_at + make_interval(days => (lf.bags * p.days_per_bag)::int), 'Dy') end
             when lf.filled_at is null then 'never filled'
             else extract(day from now() - lf.filled_at)::int || ' days'
           end as note,
           coalesce(lf.filled_at, 'epoch'::timestamptz) as sort_key,
           lf.filled_at, lf.bags, p.days_per_bag, p.fill_interval_days
    from public.pins p
    left join lateral (
      select f.filled_at, f.bags from public.feeder_fills f
      where f.feeder_id = p.id and f.deleted_at is null order by f.filled_at desc limit 1
    ) lf on true
    where (p.type = 'feeder' or p.has_feeder) and p.deleted_at is null
  ) d
  where (bags is not null and days_per_bag is not null and filled_at + make_interval(days => (bags * days_per_bag)::int) <= now() + interval '2 days')
     or (not (bags is not null and days_per_bag is not null) and fill_interval_days is not null
         and (filled_at is null or now() - filled_at >= make_interval(days => fill_interval_days)));
  if v_list is not null then
    perform public.notify_push('feeders_overdue', 'Feeders due', v_list, '/blinds');
  end if;
end;
$$;

revoke execute on function public.push_feeders_overdue() from public, anon, authenticated;

alter publication supabase_realtime add table public.info_items, public.assets;
