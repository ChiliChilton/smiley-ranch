-- Sample data for local testing. Runs automatically on `supabase db reset`.
-- Do NOT run this against the real property's project.
--
-- Family code: deer-camp   Admin PIN: 4321

select public.bootstrap_secrets('deer-camp', '4321');

insert into public.members (id, name) values
  ('00000000-0000-4000-8000-000000000001', 'Dad'),
  ('00000000-0000-4000-8000-000000000002', 'Mom'),
  ('00000000-0000-4000-8000-000000000003', 'Uncle Mike'),
  ('00000000-0000-4000-8000-000000000004', 'Cousin Sam'),
  ('00000000-0000-4000-8000-000000000005', 'Jake'),
  ('00000000-0000-4000-8000-000000000006', 'Guest Tom')
on conflict (id) do nothing;

-- Deactivated member keeps history but can't sign in.
update public.members set is_active = false where id = '00000000-0000-4000-8000-000000000006';

-- Stands (coordinates are a made-up property near Llano, TX)
insert into public.pins (id, type, name, stand_type, lat, lng, notes, created_by) values
  ('00000000-0000-4000-8000-000000000101', 'stand', 'North Ladder',   'ladder',       30.7612, -98.6751, 'Faces the creek bottom', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000102', 'stand', 'Box Blind',      'box_blind',    30.7588, -98.6712, 'Overlooks the big food plot', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000103', 'stand', 'Tank Blind',     'ground_blind', 30.7559, -98.6788, 'Ground blind by the stock tank', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000104', 'stand', 'South Ladder',   'ladder',       30.7531, -98.6734, null, '00000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

-- Feeders
insert into public.pins (id, type, name, fill_interval_days, lat, lng, notes, created_by) values
  ('00000000-0000-4000-8000-000000000201', 'feeder', 'Plot Feeder',   14, 30.7593, -98.6720, 'Corn, 300 lb hopper', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000202', 'feeder', 'Creek Feeder',  21, 30.7620, -98.6765, 'Protein', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000203', 'feeder', 'South Feeder',  14, 30.7525, -98.6740, null, '00000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

-- Other pins
insert into public.pins (id, type, name, lat, lng, created_by) values
  ('00000000-0000-4000-8000-000000000301', 'camera', 'Plot Cam',       30.7595, -98.6718, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000302', 'gate',   'Front Gate',     30.7500, -98.6700, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000303', 'water',  'Stock Tank',     30.7555, -98.6790, '00000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

-- A couple of fills so the feeder colors mean something
insert into public.feeder_fills (feeder_id, filled_at, amount, feed_type, created_by) values
  ('00000000-0000-4000-8000-000000000201', now() - interval '3 days',  '200 lb', 'corn',    '00000000-0000-4000-8000-000000000004'),
  ('00000000-0000-4000-8000-000000000202', now() - interval '19 days', '100 lb', 'protein', '00000000-0000-4000-8000-000000000003'),
  ('00000000-0000-4000-8000-000000000203', now() - interval '30 days', '150 lb', 'corn',    '00000000-0000-4000-8000-000000000001');

-- Check-out list ("Smiley check list before you go")
insert into public.checklist_items (title, sort_order, created_by)
select title, row_number() over (), '00000000-0000-4000-8000-000000000001'
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

-- Emergency info (admin edits this in the app under More > Emergency info)
insert into public.settings (key, value) values
  ('emergency_address',    '1234 County Road 100, Llano, TX 78643'),
  ('emergency_directions', 'Front gate is 2.1 mi north of FM 152 on CR 100, green pipe gate on the left. Cabin is 0.6 mi in.'),
  ('emergency_lat',        '30.7560'),
  ('emergency_lng',        '-98.6745'),
  ('emergency_extra',      'Nearest ER: Llano Memorial, 200 W Ollie St. Llano County Sheriff: (325) 247-5767')
on conflict (key) do nothing;

-- Calendar
insert into public.events (title, kind, starts_on, ends_on, notes, created_by) values
  ('Opening weekend',    'inclusive', date_trunc('week', current_date)::date + 5,  date_trunc('week', current_date)::date + 7,  'Everybody welcome. Potluck Saturday night.', '00000000-0000-4000-8000-000000000001'),
  ('Mike + friends',     'exclusive', current_date + 12, current_date + 14, 'Have the place to ourselves this weekend.', '00000000-0000-4000-8000-000000000003'),
  ('Work day',           'inclusive', current_date + 20, current_date + 20, 'Fix the north fence, fill feeders.', '00000000-0000-4000-8000-000000000001'),
  ('Season ends',        'info',      current_date + 90, current_date + 90, null, '00000000-0000-4000-8000-000000000001');

insert into public.event_attendees (event_id, member_id, note, created_by)
select e.id, '00000000-0000-4000-8000-000000000004', 'Bringing my dog', '00000000-0000-4000-8000-000000000004'
from public.events e where e.title = 'Opening weekend';
