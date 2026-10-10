-- Back 40: Phase 4 additions
--   * harvests: Texas tag number and "logged on my license" flag

alter table public.harvests
  add column tag_number text,
  add column logged_on_license boolean not null default false;
