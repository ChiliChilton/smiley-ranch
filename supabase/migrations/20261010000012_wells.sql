-- A water can have a well with named valves (Big Lake has one with two).
-- Status lives with the water: well running or off, each valve open or closed, who last checked.
alter table public.pins
  add column has_well boolean not null default false,
  add column well_on  boolean not null default false,
  add column valves   jsonb not null default '[]'::jsonb;   -- [{"name": "Valve 1", "open": true}, ...]
