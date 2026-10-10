-- Back 40: the REAL property data for Smiley (Gonzales CAD parcel 8554).
-- Run this on the live Supabase project after the migrations and after adding the first member:
--   psql ... -f supabase/property.sql     (or paste into the SQL editor)
-- It is safe to run more than once. It does NOT add sample members, stands, or feeders;
-- the admin places those in the app (Map > + > Drop a pin / Put a pin).

-- Property record (Gonzales CAD). Non-secret; members can read it.
insert into public.settings (key, value) values
  ('property_name',   'Smiley'),
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

-- Real pins from the parcel KML (gate at the CR 211 frontage, 911 address point, NHD water)
insert into public.pins (id, type, name, lat, lng, created_by) values
  ('00000000-0000-4000-8000-000000000302', 'gate',   'Front Gate',     29.2272, -97.6490, (select id from public.members order by created_at limit 1)),
  ('00000000-0000-4000-8000-000000000303', 'water',  'Stock Tank',     29.2321, -97.6664, (select id from public.members order by created_at limit 1)),
  ('00000000-0000-4000-8000-000000000304', 'water',  'Mound Creek',    29.2284, -97.6535, (select id from public.members order by created_at limit 1)),
  ('00000000-0000-4000-8000-000000000305', 'water',  'Board Branch',   29.2282, -97.6589, (select id from public.members order by created_at limit 1)),
  ('00000000-0000-4000-8000-000000000306', 'other',  'House (911 address point)', 29.2273, -97.6519, (select id from public.members order by created_at limit 1))
on conflict (id) do nothing;
