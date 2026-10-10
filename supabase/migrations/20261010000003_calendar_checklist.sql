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
