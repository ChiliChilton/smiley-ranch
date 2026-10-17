-- Smiley Ranch: every migration plus the property seed, in order, for pasting into the Supabase SQL editor.
-- Generated 2026-10-17. Run once on a fresh project. Then run: select public.bootstrap_secrets('<family code>', '<admin PIN>');


-- ===== supabase/migrations/20261010000001_identity.sql =====
-- Back 40: identity, members, settings
--
-- Identity model
--   * Every device signs in with Supabase Anonymous Auth, so it has an auth.users row.
--   * join_with_code(code, member_id) checks the family code and links that auth user
--     to a members row via member_devices.
--   * unlock_admin(pin) flips member_devices.is_admin for the calling device.
--   * The family code and admin PIN live hashed in settings (bcrypt via pgcrypto).
--   * Row Level Security everywhere. Only auth users linked to an active member
--     can read or write anything.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.members (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 40),
  is_active   boolean not null default true,
  created_by  uuid references public.members(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.members is 'People who use the app. Deactivated members keep their history.';

create table public.settings (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

comment on table public.settings is 'App-wide settings. family_code_hash and admin_pin_hash are bcrypt hashes and never leave the database.';

create table public.member_devices (
  auth_user_id  uuid primary key references auth.users(id) on delete cascade,
  member_id     uuid not null references public.members(id),
  is_admin      boolean not null default false,
  joined_at     timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

comment on table public.member_devices is 'Links an anonymous auth user (one per device) to the member who picked their name on it.';

create index member_devices_member_id_idx on public.member_devices(member_id);

-- ---------------------------------------------------------------------------
-- Helper functions used by RLS policies
-- ---------------------------------------------------------------------------

create or replace function public.current_member_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select d.member_id
  from public.member_devices d
  join public.members m on m.id = d.member_id
  where d.auth_user_id = auth.uid()
    and m.is_active;
$$;

create or replace function public.is_active_member()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.current_member_id() is not null;
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((
    select d.is_admin
    from public.member_devices d
    join public.members m on m.id = d.member_id
    where d.auth_user_id = auth.uid()
      and m.is_active
  ), false);
$$;

-- Generic triggers -----------------------------------------------------------

create or replace function public.set_created_by()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.created_by is null then
    new.created_by := public.current_member_id();
  end if;
  return new;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger members_set_created_by before insert on public.members
  for each row execute function public.set_created_by();
create trigger members_set_updated_at before update on public.members
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Secrets (family code, admin PIN)
-- ---------------------------------------------------------------------------

create or replace function public.check_secret(p_key text, p_value text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.settings
    where key = p_key
      and value = crypt(p_value, value)
  );
$$;

-- Not callable from the API. Run from the SQL editor to set the first code and PIN:
--   select public.bootstrap_secrets('your-family-code', '1234');
create or replace function public.bootstrap_secrets(p_family_code text, p_admin_pin text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if length(btrim(p_family_code)) < 4 then
    raise exception 'Family code must be at least 4 characters';
  end if;
  if length(btrim(p_admin_pin)) < 4 then
    raise exception 'Admin PIN must be at least 4 characters';
  end if;
  insert into public.settings (key, value)
  values ('family_code_hash', crypt(btrim(p_family_code), gen_salt('bf'))),
         ('admin_pin_hash',   crypt(btrim(p_admin_pin),   gen_salt('bf')))
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;

revoke execute on function public.bootstrap_secrets(text, text) from public, anon, authenticated;
revoke execute on function public.check_secret(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPCs called by the app
-- ---------------------------------------------------------------------------

-- Who is this device? Safe to call before joining.
create or replace function public.whoami()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_build_object(
      'member_id', m.id,
      'name',      m.name,
      'is_active', m.is_active,
      'is_admin',  d.is_admin and m.is_active
    )
    from public.member_devices d
    join public.members m on m.id = d.member_id
    where d.auth_user_id = auth.uid()
  ), jsonb_build_object('member_id', null, 'name', null, 'is_active', false, 'is_admin', false));
$$;

-- Step 1 of onboarding: show the names once the code is right.
create or replace function public.list_members_with_code(code text)
returns table (id uuid, name text)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if not public.check_secret('family_code_hash', btrim(code)) then
    raise exception 'That family code is not right' using errcode = '28P01';
  end if;
  return query
    select m.id, m.name from public.members m
    where m.is_active
    order by m.name;
end;
$$;

-- Step 2 of onboarding: link this device to a member.
create or replace function public.join_with_code(code text, member_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_member uuid := member_id;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if not public.check_secret('family_code_hash', btrim(code)) then
    raise exception 'That family code is not right' using errcode = '28P01';
  end if;
  if not exists (select 1 from public.members m where m.id = v_member and m.is_active) then
    raise exception 'That person is not on the list' using errcode = 'P0002';
  end if;

  insert into public.member_devices (auth_user_id, member_id)
  values (auth.uid(), v_member)
  on conflict (auth_user_id) do update
    set member_id = excluded.member_id,
        is_admin = false,
        last_seen_at = now();

  return public.whoami();
end;
$$;

-- Settings > Switch person (shared devices). The device must already be linked.
create or replace function public.switch_member(member_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_member uuid := member_id;
begin
  if not public.is_active_member() then
    raise exception 'Join with the family code first' using errcode = '28000';
  end if;
  if not exists (select 1 from public.members m where m.id = v_member and m.is_active) then
    raise exception 'That person is not on the list' using errcode = 'P0002';
  end if;

  update public.member_devices
    set member_id = v_member, is_admin = false, last_seen_at = now()
    where auth_user_id = auth.uid();

  return public.whoami();
end;
$$;

create or replace function public.unlock_admin(pin text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_active_member() then
    raise exception 'Join with the family code first' using errcode = '28000';
  end if;
  if not public.check_secret('admin_pin_hash', btrim(pin)) then
    raise exception 'That PIN is not right' using errcode = '28P01';
  end if;
  update public.member_devices set is_admin = true where auth_user_id = auth.uid();
  return public.whoami();
end;
$$;

create or replace function public.lock_admin()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  update public.member_devices set is_admin = false where auth_user_id = auth.uid();
  return public.whoami();
end;
$$;

create or replace function public.set_family_code(new_code text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  if length(btrim(new_code)) < 4 then
    raise exception 'Family code must be at least 4 characters';
  end if;
  insert into public.settings (key, value)
  values ('family_code_hash', crypt(btrim(new_code), gen_salt('bf')))
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;

create or replace function public.set_admin_pin(new_pin text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  if length(btrim(new_pin)) < 4 then
    raise exception 'Admin PIN must be at least 4 characters';
  end if;
  insert into public.settings (key, value)
  values ('admin_pin_hash', crypt(btrim(new_pin), gen_salt('bf')))
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.members enable row level security;
alter table public.settings enable row level security;
alter table public.member_devices enable row level security;

-- members: any active member can read the roster; only the admin changes it.
create policy members_select on public.members
  for select to authenticated
  using (public.is_active_member());

create policy members_insert on public.members
  for insert to authenticated
  with check (public.is_admin());

create policy members_update on public.members
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- settings: hashes are never readable. Other keys (none yet) are readable by members.
create policy settings_select on public.settings
  for select to authenticated
  using (public.is_active_member() and key not like '%\_hash');

-- member_devices: a device can see its own row and nothing else. Writes go through RPCs.
create policy member_devices_select_own on public.member_devices
  for select to authenticated
  using (auth_user_id = auth.uid());


-- ===== supabase/migrations/20261010000002_content.sql =====
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
  days_per_bag         numeric(5,1) check (days_per_bag is null or days_per_bag between 0.1 and 365),  -- how long one bag lasts in this feeder
  created_by           uuid references public.members(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  constraint pins_stand_type_only_for_stands
    check (stand_type is null or type = 'stand'),
  constraint pins_fill_interval_only_for_feeders
    check (fill_interval_days is null or type = 'feeder'),
  constraint pins_days_per_bag_only_for_feeders
    check (days_per_bag is null or type = 'feeder')
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
-- Harvests, feeder fills
-- ---------------------------------------------------------------------------

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
  bags        numeric(5,1) check (bags is null or bags between 0 and 999),   -- how many bags went in
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
  parent_type  text not null check (parent_type in ('log_entry', 'harvest', 'todo', 'event', 'pin')),
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
  place         text check (place in ('house', 'trailer', 'barn')),   -- where it lives / where it's needed
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
    'pins', 'areas', 'stand_claims', 'harvests', 'feeder_fills',
    'log_entries', 'comments', 'events', 'event_attendees', 'todos',
    'supply_items', 'push_subscriptions'
  ] loop
    execute format(
      'create trigger %I_set_created_by before insert on public.%I
         for each row execute function public.set_created_by()', t, t);
  end loop;

  foreach t in array array[
    'pins', 'areas', 'harvests', 'log_entries', 'comments',
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
    'pins', 'areas', 'stand_claims', 'harvests', 'feeder_fills',
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
    'harvests', 'feeder_fills', 'log_entries', 'comments',
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
  public.harvests, public.supply_items, public.members;


-- ===== supabase/migrations/20261010000003_calendar_checklist.sql =====
-- Back 40: calendar marks, check-out list, emergency info
--
--   * events.kind: exclusive ("just us, don't come"), inclusive ("come join"),
--     info (season dates, reminders). Two live exclusive stays can't overlap.
--   * event_attendees.note: "I'm in" with a note like "bringing my nephew".
--   * checklist_items: the "before you leave" list. Admin edits it.
--   * checkouts: each time someone leaves, a snapshot of the list and what they ticked.
--   * settings: the admin can now write non-secret keys (emergency address etc).

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- Calendar
-- ---------------------------------------------------------------------------

create type public.event_kind as enum ('exclusive', 'inclusive', 'info');

alter table public.events
  add column kind public.event_kind not null default 'inclusive';

alter table public.event_attendees
  add column note text;

-- Race-safe backstop: two live exclusive stays can't share a day.
alter table public.events
  add constraint events_exclusive_no_overlap
  exclude using gist (daterange(starts_on, ends_on, '[]') with &&)
  where (kind = 'exclusive' and deleted_at is null);

-- Friendly message with who already has the dates (runs before the constraint).
create or replace function public.events_check_exclusive()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_other record;
begin
  if new.kind <> 'exclusive' or new.deleted_at is not null then
    return new;
  end if;
  select e.title, m.name into v_other
  from public.events e
  left join public.members m on m.id = e.created_by
  where e.kind = 'exclusive'
    and e.deleted_at is null
    and e.id <> new.id
    and daterange(e.starts_on, e.ends_on, '[]') && daterange(new.starts_on, new.ends_on, '[]')
  limit 1;
  if found then
    raise exception '% already has the place those dates (%)', coalesce(v_other.name, 'Someone'), v_other.title
      using errcode = '23P01';
  end if;
  return new;
end;
$$;

create trigger events_check_exclusive before insert or update on public.events
  for each row execute function public.events_check_exclusive();

create index events_range_idx on public.events using gist (daterange(starts_on, ends_on, '[]'))
  where deleted_at is null;

-- Attendees can edit their own note.
create policy event_attendees_update on public.event_attendees for update to authenticated
  using (public.is_active_member() and (member_id = public.current_member_id() or public.is_admin()))
  with check (public.is_active_member() and (member_id = public.current_member_id() or public.is_admin()));

-- ---------------------------------------------------------------------------
-- Check-out list
-- ---------------------------------------------------------------------------

create table public.checklist_items (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(btrim(title)) between 1 and 200),
  sort_order  integer not null default 0,
  created_by  uuid references public.members(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table public.checkouts (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.members(id),   -- who left
  event_id    uuid references public.events(id),             -- the stay, if any
  left_at     timestamptz not null default now(),
  -- snapshot: [{"id": uuid, "title": text, "done": bool}, ...]
  items       jsonb not null default '[]'::jsonb,
  all_done    boolean not null default false,
  notes       text,
  created_by  uuid references public.members(id),
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index checkouts_left_at_idx on public.checkouts(left_at desc) where deleted_at is null;

create trigger checklist_items_set_created_by before insert on public.checklist_items
  for each row execute function public.set_created_by();
create trigger checklist_items_set_updated_at before update on public.checklist_items
  for each row execute function public.set_updated_at();
create trigger checkouts_set_created_by before insert on public.checkouts
  for each row execute function public.set_created_by();

alter table public.checklist_items enable row level security;
alter table public.checkouts enable row level security;

create policy checklist_items_select on public.checklist_items for select to authenticated
  using (public.is_active_member() and (deleted_at is null or public.is_admin()));
create policy checklist_items_write on public.checklist_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy checkouts_select on public.checkouts for select to authenticated
  using (public.is_active_member() and (deleted_at is null or public.is_admin()));
create policy checkouts_insert on public.checkouts for insert to authenticated
  with check (public.is_active_member() and created_by = public.current_member_id() and member_id = public.current_member_id());
create policy checkouts_update on public.checkouts for update to authenticated
  using (public.is_active_member() and (created_by = public.current_member_id() or public.is_admin()))
  with check (public.is_active_member() and (created_by = public.current_member_id() or public.is_admin()));

-- ---------------------------------------------------------------------------
-- Settings the admin can edit from the app (never the *_hash keys)
-- ---------------------------------------------------------------------------

create policy settings_admin_insert on public.settings for insert to authenticated
  with check (public.is_admin() and key not like '%\_hash');
create policy settings_admin_update on public.settings for update to authenticated
  using (public.is_admin() and key not like '%\_hash')
  with check (public.is_admin() and key not like '%\_hash');

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table
  public.events, public.event_attendees, public.checkouts, public.checklist_items, public.settings;


-- ===== supabase/migrations/20261010000004_harvest_tags.sql =====
-- Back 40: Phase 4 additions
--   * harvests: Texas tag number and "logged on my license" flag

alter table public.harvests
  add column tag_number text,
  add column logged_on_license boolean not null default false;


-- ===== supabase/migrations/20261010000005_push.sql =====
-- Back 40: push notifications
--
-- How it fits together
--   * Phones subscribe (Web Push) and store the subscription + their preferences in push_subscriptions.
--   * Postgres triggers call public.notify_push(kind, title, body, url, only, exclude), which POSTs to the
--     "push" Edge Function through pg_net. The function fans out to every subscription whose prefs[kind] is true.
--   * A scheduled job (pg_cron) sends the morning feeder digest.
--   * Nothing here fails if pg_net / pg_cron / the function URL aren't set up: notify_push just does nothing.
--
-- One-time setup (README): deploy the function, then in the SQL editor
--   insert into private.config (key, value) values
--     ('push_url', 'https://<project-ref>.supabase.co/functions/v1/push'),
--     ('push_secret', '<the same PUSH_SECRET you gave the function>');

do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then create extension if not exists pg_net; end if;
end $$;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.config (
  key    text primary key,
  value  text not null
);

-- Notification kinds (keys of push_subscriptions.prefs):
--   stand_claims, harvests, todos_assigned, feeders_overdue, events

create or replace function public.notify_push(
  p_kind text, p_title text, p_body text, p_url text default '/',
  p_only uuid[] default null, p_exclude uuid default null
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  select value into v_url from private.config where key = 'push_url';
  select value into v_secret from private.config where key = 'push_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  begin
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
      body := jsonb_build_object('kind', p_kind, 'title', p_title, 'body', p_body, 'url', p_url,
                                 'only', to_jsonb(p_only), 'exclude', p_exclude)
    );
  exception when others then
    null; -- never let a notification problem block the write that caused it
  end;
end;
$$;

revoke execute on function public.notify_push(text, text, text, text, uuid[], uuid) from public, anon, authenticated;

create or replace function public.member_name(p_id uuid) returns text
language sql stable security definer set search_path = public
as $$ select coalesce((select name from public.members where id = p_id), 'Someone') $$;

-- ---------------------------------------------------------------------------
-- Stand claims for this coming weekend (through the next Sunday)
-- ---------------------------------------------------------------------------
create or replace function public.trg_push_stand_claim() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_stand text;
  v_sunday date := current_date + ((7 - extract(dow from current_date)::int) % 7);
  v_when text;
begin
  if tg_op = 'UPDATE' and (old.released_at is not null or new.released_at is null) then
    return new; -- only care about a release happening now
  end if;
  if new.date < current_date or new.date > v_sunday then
    return new;
  end if;
  select name into v_stand from public.pins where id = new.stand_id;
  v_when := to_char(new.date, 'Dy') || ' ' || upper(new.sit::text);
  if tg_op = 'INSERT' then
    perform public.notify_push('stand_claims', 'Stand claimed',
      public.member_name(new.member_id) || ' claimed ' || coalesce(v_stand, 'a stand') || ' for ' || v_when,
      '/stands', null, new.member_id);
  else
    perform public.notify_push('stand_claims', 'Stand opened up',
      coalesce(v_stand, 'A stand') || ' is open again for ' || v_when,
      '/stands', null, coalesce(new.released_by, new.member_id));
  end if;
  return new;
end;
$$;

create trigger stand_claims_push after insert or update on public.stand_claims
  for each row execute function public.trg_push_stand_claim();

-- ---------------------------------------------------------------------------
-- New harvest
-- ---------------------------------------------------------------------------
create or replace function public.trg_push_harvest() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.notify_push('harvests', 'New harvest',
    public.member_name(new.member_id) || ' took a ' ||
      case when new.sex in ('buck', 'doe') then new.sex || ' ' else '' end || lower(new.species) ||
      coalesce(' (' || new.description || ')', ''),
    '/harvests', null, new.created_by);
  return new;
end;
$$;

create trigger harvests_push after insert on public.harvests
  for each row execute function public.trg_push_harvest();

-- ---------------------------------------------------------------------------
-- To-do assigned to me
-- ---------------------------------------------------------------------------
create or replace function public.trg_push_todo() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.assignee_id is null or new.status <> 'open' then return new; end if;
  if tg_op = 'UPDATE' and old.assignee_id is not distinct from new.assignee_id then return new; end if;
  if new.assignee_id = new.created_by and tg_op = 'INSERT' then return new; end if;
  perform public.notify_push('todos_assigned', 'To-do for you',
    public.member_name(coalesce(new.created_by, new.assignee_id)) || ': ' || new.title,
    '/todos', array[new.assignee_id], null);
  return new;
end;
$$;

create trigger todos_push after insert or update on public.todos
  for each row execute function public.trg_push_todo();

-- ---------------------------------------------------------------------------
-- New calendar entry
-- ---------------------------------------------------------------------------
create or replace function public.trg_push_event() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.notify_push('events', 'Added to the calendar',
    public.member_name(new.created_by) || ': ' || new.title || ' · ' ||
      to_char(new.starts_on, 'Mon DD') || case when new.ends_on <> new.starts_on then '–' || to_char(new.ends_on, 'DD') else '' end ||
      case new.kind when 'exclusive' then ' (just them)' when 'inclusive' then ' (come join)' else '' end,
    '/calendar/' || new.id, null, new.created_by);
  return new;
end;
$$;

create trigger events_push after insert on public.events
  for each row execute function public.trg_push_event();

-- ---------------------------------------------------------------------------
-- Scheduled: feeders due / running out digest
-- ---------------------------------------------------------------------------
create or replace function public.push_feeders_overdue() returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_list text;
begin
  -- A feeder is "due" when the bag estimate says it runs out within 2 days (or already has),
  -- or, with no bag info, when the fixed interval has passed.
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
    where p.type = 'feeder' and p.deleted_at is null
  ) d
  where (bags is not null and days_per_bag is not null and filled_at + make_interval(days => (bags * days_per_bag)::int) <= now() + interval '2 days')
     or (not (bags is not null and days_per_bag is not null) and fill_interval_days is not null
         and (filled_at is null or now() - filled_at >= make_interval(days => fill_interval_days)));
  if v_list is not null then
    perform public.notify_push('feeders_overdue', 'Feeders due', v_list, '/feeders');
  end if;
end;
$$;

revoke execute on function public.push_feeders_overdue() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('smiley-feeders-digest', '0 12 * * *', $job$select public.push_feeders_overdue()$job$);   -- 7am Central
  end if;
end;
$$;


-- ===== supabase/migrations/20261010000006_seasons.sql =====
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


-- ===== supabase/migrations/20261010000007_ranch.sql =====
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


-- ===== supabase/migrations/20261010000008_no_map.sql =====
-- The map is gone. Blinds and feeders are set up from a list; a GPS spot is optional
-- (it only powers a Directions link). Boundary and area rows stay for the export.
alter table public.pins alter column lat drop not null;
alter table public.pins alter column lng drop not null;
alter table public.pins add constraint pins_lat_lng_together check ((lat is null) = (lng is null));


-- ===== supabase/migrations/20261010000009_spots.sql =====
-- Blinds are hunting spots that need upkeep, not seats to reserve.
--   * Status on each pin: feeder motor, lock, chairs, trail cam, a condition line,
--     and who last touched it. Anyone in the family keeps these current.
--   * Anyone can add or edit a blind or feeder. Only the admin removes one.

alter table public.pins
  add column motor_status  text not null default 'working' check (motor_status in ('working', 'down')),
  add column lock_status   text not null default 'none' check (lock_status in ('none', 'locked', 'unlocked')),
  add column chairs        integer not null default 0 check (chairs between 0 and 20),
  add column has_camera    boolean not null default false,
  add column camera_status text not null default 'working' check (camera_status in ('working', 'batteries', 'down')),
  add column condition     text check (condition is null or length(condition) <= 300),
  add column status_by     uuid references public.members(id),
  add column status_at     timestamptz;

drop policy pins_insert on public.pins;
drop policy pins_update on public.pins;
create policy pins_insert on public.pins for insert to authenticated
  with check (public.is_active_member() and created_by = public.current_member_id());
create policy pins_update on public.pins for update to authenticated
  using (public.is_active_member()) with check (public.is_active_member());


-- ===== supabase/migrations/20261010000010_anyone_adds_equipment.sql =====
-- Anyone in the family can add or rename equipment, like blinds. Admin still removes.
drop policy assets_insert on public.assets;
create policy assets_insert on public.assets for insert to authenticated
  with check (public.is_active_member() and created_by = public.current_member_id());


-- ===== supabase/migrations/20261010000011_fishing_photos.sql =====
-- Fishing and photos.
--   * Two waters (Front Tank, Big Lake) are pins of type 'water' with a level and condition.
--   * catches: who caught what, where, on what. One optional photo each.
--   * Photos: one Storage bucket "photos", public read, written by active members.
--     Kept small by the app (shrunk before upload) and by the app's own cleanup:
--     anything older than 12 months, or beyond the newest 250, gets deleted.
--     One optional photo on harvests, catches, property notes, comments (project
--     updates), and a blind's condition.

alter table public.pins
  add column water_level text not null default 'full' check (water_level in ('full', 'down', 'low')),
  add column acres numeric(6,1) check (acres is null or acres > 0),
  add column photo_path text;

create table public.catches (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references public.members(id),
  pin_id      uuid references public.pins(id),
  caught_on   date not null default current_date,
  species     text not null check (length(btrim(species)) between 1 and 40),
  weight_lb   numeric(5,2) check (weight_lb is null or weight_lb > 0),
  length_in   numeric(5,1) check (length_in is null or length_in > 0),
  bait        text check (bait is null or length(bait) <= 80),
  notes       text check (notes is null or length(notes) <= 1000),
  released    boolean not null default false,
  photo_path  text,
  created_by  uuid references public.members(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index catches_water_idx on public.catches(pin_id, caught_on desc) where deleted_at is null;

create trigger catches_set_created_by before insert on public.catches
  for each row execute function public.set_created_by();
create trigger catches_set_updated_at before update on public.catches
  for each row execute function public.set_updated_at();

alter table public.catches enable row level security;
create policy catches_select on public.catches for select to authenticated
  using (public.is_active_member() and (deleted_at is null or public.is_admin()));
create policy catches_insert on public.catches for insert to authenticated
  with check (public.is_active_member() and created_by = public.current_member_id());
create policy catches_update on public.catches for update to authenticated
  using (public.is_active_member() and (created_by = public.current_member_id() or member_id = public.current_member_id() or public.is_admin()))
  with check (public.is_active_member());

alter table public.harvests add column photo_path text;
alter table public.log_entries add column photo_path text;
alter table public.comments add column photo_path text;
alter table public.comments drop constraint if exists comments_parent_type_check;
alter table public.comments add constraint comments_parent_type_check
  check (parent_type in ('log_entry', 'harvest', 'todo', 'event', 'pin', 'catch'));

alter publication supabase_realtime add table public.catches;

-- ---------------------------------------------------------------------------
-- Photos bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 1048576, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create policy photos_read on storage.objects for select to authenticated, anon
  using (bucket_id = 'photos');
create policy photos_write on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.is_active_member());
-- Anyone in the family may clear out old photos; the admin may remove any; you may remove your own.
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.is_active_member()
         and (public.is_admin() or owner = auth.uid() or created_at < now() - interval '365 days'));


-- ===== supabase/migrations/20261010000012_wells.sql =====
-- A water can have a well with named valves (Big Lake has one with two).
-- Status lives with the water: well running or off, each valve open or closed, who last checked.
alter table public.pins
  add column has_well boolean not null default false,
  add column well_on  boolean not null default false,
  add column valves   jsonb not null default '[]'::jsonb;   -- [{"name": "Valve 1", "open": true}, ...]


-- ===== supabase/migrations/20261010000013_pins_trips.sql =====
-- Pinned property notes, and needs or projects tied to a trip.
alter table public.log_entries add column pinned boolean not null default false;
alter table public.supply_items add column event_id uuid references public.events(id);
alter table public.todos add column event_id uuid references public.events(id);
create index supply_items_event_idx on public.supply_items(event_id) where deleted_at is null and needed;
create index todos_event_idx on public.todos(event_id) where deleted_at is null and status = 'open';


-- ===== supabase/migrations/20261010000014_shared_lists.sql =====
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


-- ===== supabase/property.sql =====
-- Back 40: the REAL property data for Smiley (Gonzales CAD parcel 8554).
-- Run this on the live Supabase project after the migrations and after adding the first member:
--   psql ... -f supabase/property.sql     (or paste into the SQL editor)
-- Safe to run more than once. Map-wise it adds ONLY the property boundary;
-- the admin places everything else in the app (Map > + > Drop a pin / Put a pin).

-- Property record (Gonzales CAD). Non-secret; members can read it.
insert into public.settings (key, value) values
  ('property_name',   'Smiley Ranch'),
  ('property_parcel', 'Gonzales CAD parcel 8554, Abstract 380 George W. Petty survey, 418.5 ac, owner Kiatta Properties LP')
on conflict (key) do nothing;

-- Emergency info (admin edits this in the app under More > Emergency info)
insert into public.settings (key, value) values
  ('emergency_address',    '1932 CR 211, Smiley, TX 78159'),
  ('emergency_directions', 'GPS is the 911 address point for 1932 CR 211 (inside the place near the east end). Gate is where the east tip meets CR 211. Admin: add landmarks here.'),
  ('emergency_lat',        '29.2273'),
  ('emergency_lng',        '-97.6519'),
  ('emergency_extra',      'Placeholder. Nearest ER and the Gonzales County Sheriff number go here.')
on conflict (key) do nothing;

-- Check-out list ("Smiley check list before you go")
insert into public.checklist_items (title, sort_order, created_by)
select title, row_number() over (), (select id from public.members order by created_at limit 1)
from unnest(array[
  'Winter: leave the heater in the house and trailer on 67. Summer: house AC on 84, trailer AC off',
  'Turn off the breaker for the hot water heater in the trailer (in the bunk bed room)',
  'Check the freezer, fridge and pantry. No opened leftovers, no duplicates, nothing that can expire. Leave open pantry space for the next group',
  'No dirty dishes in the sink',
  'Empty the dishwasher',
  'Take dirty dish towels home to wash and bring back. If you''re not coming back soon, wash, dry and put them away',
  'Turn all lights off in the house, trailer and porch',
  'Take all your trash home with you, including bathrooms and barn',
  'Leave $110 for cleaning on the kitchen counter, or Cash App Elvira',
  'Winter: turn the water off and drain the pipes if it was off when you arrived (leave it the way you found it unless told otherwise)',
  'Empty the dehumidifier in the gun room',
  'Lock the gun room (pull the door hard to close)',
  'Lock the house',
  'Lock the trailer',
  'Leave hog traps open so nothing gets trapped and dies',
  'Make sure the yard gates are closed',
  'Lock the ranch gate at the road properly (lock looped through the other lock)',
  'Rinse off the Mule, Polaris and truck if muddy',
  'Put the boat away in its spot',
  'Don''t leave the truck with less than 1/4 tank of gas',
  'Fill the mules with gas'
]) as t(title);

-- Property boundary: Gonzales CAD parcel 8554 polygon (docs/parcel-8554.kml).
insert into public.areas (id, name, is_boundary, geometry, created_by) values
  ('00000000-0000-4000-8000-000000000401', 'Property', true, '{"type": "Polygon", "coordinates": [[[-97.6490144651531, 29.227156194364934], [-97.6508498722829, 29.228053656010548], [-97.65083141257631, 29.228197554274363], [-97.65814991003325, 29.23177693979724], [-97.66647383558266, 29.23576550933583], [-97.67018058302403, 29.237552466516345], [-97.67018243776913, 29.237549551362637], [-97.67119945775156, 29.235950872745835], [-97.67119947770593, 29.235950841361255], [-97.67062239011744, 29.23567521177332], [-97.67320507726228, 29.231603645220353], [-97.6540283840339, 29.222308763919475], [-97.65248044371533, 29.221598490265077], [-97.6490144651531, 29.227156194364934]]]}'::jsonb, (select id from public.members order by created_at limit 1))
on conflict (id) do nothing;

-- No pins on purpose. The admin places stands, feeders, cameras, gates, and water in the app.
-- Mapped water from the parcel KML (Mound Creek, Board Branch, stock tank) is in docs/parcel-8554.kml if wanted later.

-- Hunting seasons, 2026-27, South Zone (Gonzales County). From the TPWD
-- Outdoor Annual; the admin updates these each fall under More > Hunting seasons.
insert into public.seasons (name, species, starts_on, ends_on, note, created_by)
select name, species, starts_on::date, ends_on::date, note, (select id from public.members order by created_at limit 1)
from (values
  ('Archery',                 'deer',   '2026-10-03', '2026-11-06', 'Archery endorsement needed.'),
  ('Youth-only weekend',      'deer',   '2026-10-30', '2026-11-01', 'Hunters 16 and under.'),
  ('General season',          'deer',   '2026-11-07', '2027-01-17', 'South Zone.'),
  ('Doe days',                'deer',   '2026-11-14', '2026-11-29', 'Antlerless by firearm, Gonzales County. Check the Outdoor Annual for the county rule.'),
  ('Special late season',     'deer',   '2027-01-18', '2027-01-31', 'Antlerless and spike bucks only. Youth-only too.'),
  ('Archery',                 'turkey', '2026-10-03', '2026-11-06', 'Rio Grande turkey.'),
  ('Fall season',             'turkey', '2026-11-07', '2027-01-17', 'South Zone.'),
  ('Spring youth weekend',    'turkey', '2027-03-13', '2027-03-14', null),
  ('Spring season',           'turkey', '2027-03-20', '2027-05-02', 'South Zone.'),
  ('Spring youth weekend',    'turkey', '2027-05-08', '2027-05-09', null),
  ('First split',             'dove',   '2026-09-01', '2026-10-25', 'South Zone. 15 a day. No special white-wing days this year.'),
  ('Second split',            'dove',   '2026-12-18', '2027-01-21', 'South Zone.'),
  ('Quail',                   'quail',  '2026-11-01', '2027-02-28', 'Upland game bird endorsement.')
) as s(name, species, starts_on, ends_on, note)
where not exists (select 1 from public.seasons);


-- Equipment and places. House, House trailer and Barn come from the migration.
insert into public.assets (name, kind, sort_order, created_by)
select name, kind, sort_order, (select id from public.members order by created_at limit 1)
from (values
  ('Truck', 'vehicle', 10), ('Tractor', 'tractor', 11),
  ('ATV 1', 'atv', 12), ('ATV 2', 'atv', 13), ('ATV 3', 'atv', 14),
  ('Haul trailer', 'trailer', 15)
) as a(name, kind, sort_order)
where not exists (select 1 from public.assets where kind <> 'building');

-- Ranch info: the labels everyone asks about. The admin fills in the values in
-- the app under Ranch info (they are never kept in code).
insert into public.info_items (section, label, value, sort_order, created_by)
select section, label, '', sort_order, (select id from public.members order by created_at limit 1)
from (values
  ('access', 'Gate code', 1), ('access', 'Wi-Fi network', 2), ('access', 'Wi-Fi password', 3),
  ('access', 'Gun room', 4),
  ('house', 'Breaker panel', 1), ('house', 'Water shutoff', 2), ('house', 'Trash day', 3),
  ('house', 'Thermostats', 4),
  ('utilities', 'Septic', 1), ('utilities', 'Well', 2), ('utilities', 'Propane', 3),
  ('contacts', 'Propane company', 1), ('contacts', 'Feed store', 2),
  ('contacts', 'Electric co-op outage line', 3), ('contacts', 'Neighbor', 4), ('contacts', 'Cleaning (Elvira)', 5)
) as i(section, label, sort_order)
where not exists (select 1 from public.info_items);

-- The blinds. Each has its own feeder; set days-per-bag in the app once you know it.
insert into public.pins (name, type, stand_type, has_feeder, created_by)
select name, 'stand'::public.pin_type, 'box_blind'::public.stand_type, true, (select id from public.members order by created_at limit 1)
from unnest(array['Tank Blind', 'Brants Blind', 'Fence Blind']) as b(name)
where not exists (select 1 from public.pins where type = 'stand');

-- The waters.
insert into public.pins (name, type, acres, notes, created_by)
select name, 'water'::public.pin_type, acres, notes, (select id from public.members order by created_at limit 1)
from (values ('Front Tank', 1.0, null::text), ('Big Lake', 5.0, null::text)) as w(name, acres, notes)
where not exists (select 1 from public.pins where type = 'water');

-- Big Lake's well and its two valves.
update public.pins set has_well = true, well_on = false,
  valves = '[{"name": "Valve 1", "open": false}, {"name": "Valve 2", "open": false}]'::jsonb
where type = 'water' and name = 'Big Lake' and not has_well;
