-- Back 40: content tables
--
-- Conventions
--   * Every row stores created_by (member id). A BEFORE INSERT trigger fills it.
--   * User content is soft-deleted via deleted_at. Members see live rows; the admin
--     also sees deleted rows so they can clean up or restore.
--   * A member can edit or soft-delete their own rows. The admin can edit anything.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.pin_type as enum
  ('stand', 'feeder', 'camera', 'water', 'gate', 'food_plot', 'hazard', 'other');

create type public.stand_type as enum ('ladder', 'box_blind', 'ground_blind');

create type public.sit as enum ('am', 'pm');

create type public.todo_status as enum ('open', 'done');

create type public.supply_level as enum ('full', 'some', 'low', 'out');

-- ---------------------------------------------------------------------------
-- Map: pins and areas
-- ---------------------------------------------------------------------------

create table public.pins (
  id                   uuid primary key default gen_random_uuid(),
  type                 public.pin_type not null,
  name                 text not null check (length(btrim(name)) between 1 and 80),
  notes                text,
  lat                  double precision not null check (lat between -90 and 90),
  lng                  double precision not null check (lng between -180 and 180),
  -- stands only
  stand_type           public.stand_type,
  -- feeders only
  fill_interval_days   integer check (fill_interval_days is null or fill_interval_days between 1 and 365),
  created_by           uuid references public.members(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  constraint pins_stand_type_only_for_stands
    check (stand_type is null or type = 'stand'),
  constraint pins_fill_interval_only_for_feeders
    check (fill_interval_days is null or type = 'feeder')
);

create index pins_type_idx on public.pins(type) where deleted_at is null;

create table public.areas (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 80),
  is_boundary boolean not null default false,
  geometry    jsonb not null,            -- GeoJSON geometry (Polygon or MultiPolygon)
  color       text,
  created_by  uuid references public.members(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- One live boundary at a time.
create unique index areas_single_boundary_idx on public.areas((is_boundary))
  where is_boundary and deleted_at is null;

-- ---------------------------------------------------------------------------
-- Stand sign-up
-- ---------------------------------------------------------------------------

create table public.stand_claims (
  id           uuid primary key default gen_random_uuid(),
  stand_id     uuid not null references public.pins(id),
  member_id    uuid not null references public.members(id),  -- who is sitting
  date         date not null,
  sit          public.sit not null,
  note         text,
  created_by   uuid references public.members(id),
  created_at   timestamptz not null default now(),
  released_at  timestamptz,
  released_by  uuid references public.members(id)
);

-- Two people can't claim the same stand for the same sit.
create unique index stand_claims_unique_live_idx
  on public.stand_claims(stand_id, date, sit)
  where released_at is null;

create index stand_claims_date_idx on public.stand_claims(date) where released_at is null;

-- ---------------------------------------------------------------------------
-- Sightings, harvests, feeder fills
-- ---------------------------------------------------------------------------

create table public.sightings (
  id           uuid primary key default gen_random_uuid(),
  species      text not null check (length(btrim(species)) between 1 and 40),
  description  text,
  count        integer not null default 1 check (count between 1 and 999),
  seen_at      timestamptz not null default now(),
  pin_id       uuid references public.pins(id),
  lat          double precision,
  lng          double precision,
  notes        text,
  created_by   uuid references public.members(id),  -- who saw it
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index sightings_seen_at_idx on public.sightings(seen_at desc) where deleted_at is null;

create table public.harvests (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references public.members(id),  -- who took it
  harvested_on  date not null default current_date,
  species       text not null check (length(btrim(species)) between 1 and 40),
  sex           text check (sex in ('buck', 'doe', 'male', 'female', 'unknown')),
  description   text,                                         -- "big 8", score
  pin_id        uuid references public.pins(id),
  lat           double precision,
  lng           double precision,
  notes         text,
  created_by    uuid references public.members(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index harvests_harvested_on_idx on public.harvests(harvested_on desc) where deleted_at is null;

create table public.feeder_fills (
  id          uuid primary key default gen_random_uuid(),
  feeder_id   uuid not null references public.pins(id),
  filled_at   timestamptz not null default now(),
  amount      text,
  feed_type   text,
  created_by  uuid references public.members(id),  -- who filled it
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index feeder_fills_feeder_idx on public.feeder_fills(feeder_id, filled_at desc) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Log, comments
-- ---------------------------------------------------------------------------

create table public.log_entries (
  id          uuid primary key default gen_random_uuid(),
  body        text not null check (length(btrim(body)) between 1 and 4000),
  pin_id      uuid references public.pins(id),
  lat         double precision,
  lng         double precision,
  created_by  uuid references public.members(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index log_entries_created_at_idx on public.log_entries(created_at desc) where deleted_at is null;

create table public.comments (
  id           uuid primary key default gen_random_uuid(),
  parent_type  text not null check (parent_type in ('log_entry', 'sighting', 'harvest', 'todo', 'event', 'pin')),
  parent_id    uuid not null,
  body         text not null check (length(btrim(body)) between 1 and 2000),
  created_by   uuid references public.members(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index comments_parent_idx on public.comments(parent_type, parent_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Calendar
-- ---------------------------------------------------------------------------

create table public.events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(btrim(title)) between 1 and 120),
  starts_on   date not null,
  ends_on     date not null,
  notes       text,
  created_by  uuid references public.members(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint events_range check (ends_on >= starts_on)
);

create index events_starts_on_idx on public.events(starts_on) where deleted_at is null;

create table public.event_attendees (
  event_id    uuid not null references public.events(id) on delete cascade,
  member_id   uuid not null references public.members(id),
  created_by  uuid references public.members(id),
  created_at  timestamptz not null default now(),
  primary key (event_id, member_id)
);

-- ---------------------------------------------------------------------------
-- To-dos
-- ---------------------------------------------------------------------------

create table public.todos (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(btrim(title)) between 1 and 200),
  notes         text,
  assignee_id   uuid references public.members(id),
  due_on        date,
  pin_id        uuid references public.pins(id),
  status        public.todo_status not null default 'open',
  completed_by  uuid references public.members(id),
  completed_at  timestamptz,
  created_by    uuid references public.members(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index todos_open_idx on public.todos(assignee_id, due_on) where status = 'open' and deleted_at is null;

-- ---------------------------------------------------------------------------
-- Needs / supplies
--   Shopping list = rows where needed = true.
--   Inventory items (is_inventory) carry a level; low/out puts them on the list.
-- ---------------------------------------------------------------------------

create table public.supply_items (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(btrim(name)) between 1 and 120),
  notes         text,
  is_inventory  boolean not null default false,
  level         public.supply_level,
  needed        boolean not null default true,
  got_by        uuid references public.members(id),
  got_at        timestamptz,
  created_by    uuid references public.members(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint supply_level_only_for_inventory check (level is null or is_inventory)
);

create or replace function public.supply_items_auto_need()
returns trigger
language plpgsql
as $$
begin
  if new.is_inventory and new.level in ('low', 'out')
     and (tg_op = 'INSERT' or old.level is distinct from new.level) then
    new.needed := true;
    new.got_by := null;
    new.got_at := null;
  end if;
  return new;
end;
$$;

create trigger supply_items_auto_need before insert or update on public.supply_items
  for each row execute function public.supply_items_auto_need();

-- ---------------------------------------------------------------------------
-- Push subscriptions
-- ---------------------------------------------------------------------------

create table public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null references auth.users(id) on delete cascade,
  member_id     uuid not null references public.members(id),
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  prefs         jsonb not null default '{}'::jsonb,
  -- prefs keys: stand_claims, harvests, todos_assigned, feeders_overdue, events
  created_by    uuid references public.members(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index push_subscriptions_member_idx on public.push_subscriptions(member_id);

-- ---------------------------------------------------------------------------
-- Triggers: created_by / updated_at on every content table
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'pins', 'areas', 'stand_claims', 'sightings', 'harvests', 'feeder_fills',
    'log_entries', 'comments', 'events', 'event_attendees', 'todos',
    'supply_items', 'push_subscriptions'
  ] loop
    execute format(
      'create trigger %I_set_created_by before insert on public.%I
         for each row execute function public.set_created_by()', t, t);
  end loop;

  foreach t in array array[
    'pins', 'areas', 'sightings', 'harvests', 'log_entries', 'comments',
    'events', 'todos', 'supply_items', 'push_subscriptions'
  ] loop
    execute format(
      'create trigger %I_set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t, t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'pins', 'areas', 'stand_claims', 'sightings', 'harvests', 'feeder_fills',
    'log_entries', 'comments', 'events', 'event_attendees', 'todos',
    'supply_items', 'push_subscriptions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- Standard member content: anyone active reads live rows (admin also sees deleted),
-- anyone active inserts as themselves, owner or admin updates. No hard deletes from the app.
do $$
declare
  t text;
begin
  foreach t in array array[
    'sightings', 'harvests', 'feeder_fills', 'log_entries', 'comments',
    'events', 'todos', 'supply_items'
  ] loop
    execute format($f$
      create policy %1$I_select on public.%1$I for select to authenticated
        using (public.is_active_member() and (deleted_at is null or public.is_admin()));
      create policy %1$I_insert on public.%1$I for insert to authenticated
        with check (public.is_active_member() and created_by = public.current_member_id());
      create policy %1$I_update on public.%1$I for update to authenticated
        using (public.is_active_member() and (created_by = public.current_member_id() or public.is_admin()))
        with check (public.is_active_member() and (created_by = public.current_member_id() or public.is_admin()));
      create policy %1$I_delete on public.%1$I for delete to authenticated
        using (public.is_admin());
    $f$, t);
  end loop;
end;
$$;

-- pins: members may add/edit their own hazard and other pins.
-- Only the admin adds, edits, or moves stands, feeders, and cameras.
create policy pins_select on public.pins for select to authenticated
  using (public.is_active_member() and (deleted_at is null or public.is_admin()));

create policy pins_insert on public.pins for insert to authenticated
  with check (
    public.is_active_member()
    and created_by = public.current_member_id()
    and (public.is_admin() or type in ('hazard', 'other'))
  );

create policy pins_update on public.pins for update to authenticated
  using (
    public.is_active_member()
    and (public.is_admin() or (created_by = public.current_member_id() and type in ('hazard', 'other')))
  )
  with check (
    public.is_active_member()
    and (public.is_admin() or (created_by = public.current_member_id() and type in ('hazard', 'other')))
  );

create policy pins_delete on public.pins for delete to authenticated
  using (public.is_admin());

-- areas: admin only writes.
create policy areas_select on public.areas for select to authenticated
  using (public.is_active_member() and (deleted_at is null or public.is_admin()));
create policy areas_write on public.areas for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- stand_claims: anyone active claims; a person releases their own, admin releases anyone's.
create policy stand_claims_select on public.stand_claims for select to authenticated
  using (public.is_active_member());

create policy stand_claims_insert on public.stand_claims for insert to authenticated
  with check (
    public.is_active_member()
    and created_by = public.current_member_id()
    and (member_id = public.current_member_id() or public.is_admin())
  );

create policy stand_claims_update on public.stand_claims for update to authenticated
  using (public.is_active_member() and (member_id = public.current_member_id() or public.is_admin()))
  with check (public.is_active_member() and (member_id = public.current_member_id() or public.is_admin()));

create policy stand_claims_delete on public.stand_claims for delete to authenticated
  using (public.is_admin());

-- event_attendees: tap "I'm in" / "I'm out" for yourself; admin can manage anyone.
create policy event_attendees_select on public.event_attendees for select to authenticated
  using (public.is_active_member());
create policy event_attendees_insert on public.event_attendees for insert to authenticated
  with check (public.is_active_member() and (member_id = public.current_member_id() or public.is_admin()));
create policy event_attendees_delete on public.event_attendees for delete to authenticated
  using (public.is_active_member() and (member_id = public.current_member_id() or public.is_admin()));

-- push_subscriptions: a device only ever sees its own subscriptions.
create policy push_subscriptions_select on public.push_subscriptions for select to authenticated
  using (auth_user_id = auth.uid());
create policy push_subscriptions_insert on public.push_subscriptions for insert to authenticated
  with check (public.is_active_member() and auth_user_id = auth.uid() and member_id = public.current_member_id());
create policy push_subscriptions_update on public.push_subscriptions for update to authenticated
  using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());
create policy push_subscriptions_delete on public.push_subscriptions for delete to authenticated
  using (auth_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table
  public.stand_claims, public.log_entries, public.todos, public.feeder_fills,
  public.sightings, public.harvests, public.supply_items, public.members;
