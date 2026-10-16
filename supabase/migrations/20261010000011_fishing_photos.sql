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
