-- The map is gone. Blinds and feeders are set up from a list; a GPS spot is optional
-- (it only powers a Directions link). Boundary and area rows stay for the export.
alter table public.pins alter column lat drop not null;
alter table public.pins alter column lng drop not null;
alter table public.pins add constraint pins_lat_lng_together check ((lat is null) = (lng is null));
