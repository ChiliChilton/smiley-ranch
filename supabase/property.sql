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
