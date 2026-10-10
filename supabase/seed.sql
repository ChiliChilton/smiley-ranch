-- SAMPLE data for local testing. Runs automatically on `supabase db reset`.
-- Do NOT run this against the real property's project; run supabase/property.sql there instead.
-- Locally, run property.sql after this file to get the real boundary, water, and check-out list.
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

-- Stands (approximate coordinates just south of Smiley, TX, Gonzales County; replace with real pins)
insert into public.pins (id, type, name, stand_type, lat, lng, notes, created_by) values
  ('00000000-0000-4000-8000-000000000101', 'stand', 'North Ladder',   'ladder',       29.2352, -97.6690, 'Faces the creek bottom', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000102', 'stand', 'Box Blind',      'box_blind',    29.2318, -97.6625, 'Overlooks the big food plot', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000103', 'stand', 'Tank Blind',     'ground_blind', 29.2290, -97.6560, 'Ground blind by the stock tank', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000104', 'stand', 'South Ladder',   'ladder',       29.2270, -97.6520, null, '00000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

-- Feeders
insert into public.pins (id, type, name, fill_interval_days, lat, lng, notes, created_by) values
  ('00000000-0000-4000-8000-000000000201', 'feeder', 'Plot Feeder',   14, 29.2322, -97.6615, 'Corn, 300 lb hopper', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000202', 'feeder', 'Creek Feeder',  21, 29.2345, -97.6675, 'Protein', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000203', 'feeder', 'South Feeder',  14, 29.2278, -97.6530, null, '00000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

-- Other sample pins
insert into public.pins (id, type, name, lat, lng, created_by) values
  ('00000000-0000-4000-8000-000000000301', 'camera', 'Plot Cam',       29.2325, -97.6608, '00000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

-- A couple of fills so the feeder colors mean something
insert into public.feeder_fills (feeder_id, filled_at, amount, feed_type, created_by) values
  ('00000000-0000-4000-8000-000000000201', now() - interval '3 days',  '200 lb', 'corn',    '00000000-0000-4000-8000-000000000004'),
  ('00000000-0000-4000-8000-000000000202', now() - interval '19 days', '100 lb', 'protein', '00000000-0000-4000-8000-000000000003'),
  ('00000000-0000-4000-8000-000000000203', now() - interval '30 days', '150 lb', 'corn',    '00000000-0000-4000-8000-000000000001');

-- Calendar
insert into public.events (title, kind, starts_on, ends_on, notes, created_by) values
  ('Opening weekend',    'inclusive', date_trunc('week', current_date)::date + 5,  date_trunc('week', current_date)::date + 7,  'Everybody welcome. Potluck Saturday night.', '00000000-0000-4000-8000-000000000001'),
  ('Mike + friends',     'exclusive', current_date + 12, current_date + 14, 'Have the place to ourselves this weekend.', '00000000-0000-4000-8000-000000000003'),
  ('Work day',           'inclusive', current_date + 20, current_date + 20, 'Fix the north fence, fill feeders.', '00000000-0000-4000-8000-000000000001'),
  ('Season ends',        'info',      current_date + 90, current_date + 90, null, '00000000-0000-4000-8000-000000000001');

insert into public.event_attendees (event_id, member_id, note, created_by)
select e.id, '00000000-0000-4000-8000-000000000004', 'Bringing my dog', '00000000-0000-4000-8000-000000000004'
from public.events e where e.title = 'Opening weekend';
