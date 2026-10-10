-- Back 40: Phase 4 additions
--   * harvests: Texas tag number and "logged on my license" flag
--   * photos: optional pin link and caption so the gallery can filter by pin
--   * feeder_fills: index for "last fill" lookups already exists

alter table public.harvests
  add column tag_number text,
  add column logged_on_license boolean not null default false;

alter table public.photos
  add column pin_id uuid references public.pins(id),
  add column caption text;

create index photos_pin_idx on public.photos(pin_id) where deleted_at is null;

alter publication supabase_realtime add table public.photos;
