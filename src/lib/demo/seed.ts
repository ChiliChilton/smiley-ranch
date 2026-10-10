import parcel from './parcel-8554.json'
import { todayISO, addDays } from '../dates'

type Row = Record<string, unknown>
const M = (n: number) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`
const today = todayISO()
const ts = (daysAgo: number, hour = 12) => {
  const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(hour, 14, 0, 0); return d.toISOString()
}
const by = M(1)
const base = (daysAgo = 30) => ({ created_by: by, created_at: ts(daysAgo), updated_at: ts(daysAgo), deleted_at: null })

export function seedDb(): Record<string, Row[]> {
  const members = ['Dad', 'Mom', 'Uncle Mike', 'Cousin Sam', 'Jake'].map((name, i) => ({ id: M(i + 1), name, is_active: true, created_by: null, created_at: ts(60), updated_at: ts(60) }))
  const checklist = [
    'Winter: leave the heater in the house and trailer on 67. Summer: house AC on 84, trailer AC off',
    'Turn off the breaker for the hot water heater in the trailer (in the bunk bed room)',
    'Check the freezer, fridge and pantry. No opened leftovers, no duplicates, nothing that can expire. Leave open pantry space for the next group',
    'No dirty dishes in the sink', 'Empty the dishwasher',
    "Take dirty dish towels home to wash and bring back. If you're not coming back soon, wash, dry and put them away",
    'Turn all lights off in the house, trailer and porch', 'Take all your trash home with you, including bathrooms and barn',
    'Leave $110 for cleaning on the kitchen counter, or Cash App Elvira',
    'Winter: turn the water off and drain the pipes if it was off when you arrived (leave it the way you found it unless told otherwise)',
    'Empty the dehumidifier in the gun room', 'Lock the gun room (pull the door hard to close)', 'Lock the house', 'Lock the trailer',
    'Leave hog traps open so nothing gets trapped and dies', 'Make sure the yard gates are closed',
    'Lock the ranch gate at the road properly (lock looped through the other lock)', 'Rinse off the Mule, Polaris and truck if muddy',
    'Put the boat away in its spot', "Don't leave the truck with less than 1/4 tank of gas", 'Fill the mules with gas',
  ].map((title, i) => ({ id: `c${i + 1}`, title, sort_order: i + 1, ...base(60) }))
  const settings = [
    ['property_name', 'Smiley'],
    ['emergency_address', '1932 CR 211, Smiley, TX 78159'],
    ['emergency_directions', 'Gate is where the east tip of the place meets CR 211. Green pipe gate.'],
    ['emergency_lat', '29.2273'], ['emergency_lng', '-97.6519'],
    ['emergency_extra', 'Nearest ER: Gonzales Memorial Hospital. Gonzales County Sheriff: (830) 672-6524'],
  ].map(([key, value]) => ({ key, value, updated_at: ts(60) }))
  const pin = (id: string, type: string, name: string, lat: number, lng: number, extra: Row = {}) => ({ id, type, name, notes: null, lat, lng, stand_type: null, fill_interval_days: null, ...base(40), ...extra })
  const pins = [
    pin('p1', 'stand', 'North Ladder', 29.2352, -97.6690, { stand_type: 'ladder', notes: 'Faces the creek bottom' }),
    pin('p2', 'stand', 'Box Blind', 29.2318, -97.6625, { stand_type: 'box_blind', notes: 'Overlooks the big food plot' }),
    pin('p3', 'stand', 'Tank Blind', 29.2290, -97.6560, { stand_type: 'ground_blind' }),
    pin('p4', 'stand', 'South Ladder', 29.2270, -97.6520, { stand_type: 'ladder' }),
    pin('p5', 'feeder', 'Plot Feeder', 29.2322, -97.6615, { fill_interval_days: 14, notes: 'Corn, 300 lb hopper' }),
    pin('p6', 'feeder', 'Creek Feeder', 29.2345, -97.6675, { fill_interval_days: 21, notes: 'Protein' }),
    pin('p7', 'camera', 'Plot Cam', 29.2325, -97.6608),
    pin('p8', 'gate', 'Front Gate', 29.2272, -97.6490),
    pin('p9', 'water', 'Stock Tank', 29.2321, -97.6664),
    pin('p10', 'water', 'Mound Creek', 29.2284, -97.6535),
    pin('p11', 'hazard', 'Fence down', 29.2300, -97.6580, { notes: 'Hogs pushed it over by the creek crossing', created_by: M(3) }),
  ]
  const areas = [{ id: 'a1', name: 'Property', is_boundary: true, geometry: (parcel as { features: { geometry: unknown }[] }).features[0].geometry, color: null, ...base(60) }]
  const dow = new Date().getDay()
  const sat = dow === 6 ? today : addDays(today, (6 - dow + 7) % 7)
  const events = [
    { id: 'e1', title: 'Opening weekend', kind: 'inclusive', starts_on: sat, ends_on: addDays(sat, 1), notes: 'Everybody welcome. Potluck Saturday night.', ...base(20) },
    { id: 'e2', title: 'Mike + friends', kind: 'exclusive', starts_on: addDays(today, 12), ends_on: addDays(today, 14), notes: 'Have the place to ourselves this weekend.', ...base(10), created_by: M(3) },
    { id: 'e3', title: 'Work day', kind: 'inclusive', starts_on: addDays(today, 20), ends_on: addDays(today, 20), notes: 'Fix the north fence, fill feeders.', ...base(5) },
    { id: 'e4', title: 'Season ends', kind: 'info', starts_on: addDays(today, 90), ends_on: addDays(today, 90), notes: null, ...base(5) },
  ]
  const event_attendees = [
    { event_id: 'e1', member_id: M(1), note: null, created_by: M(1), created_at: ts(20) },
    { event_id: 'e1', member_id: M(4), note: 'Bringing my dog', created_by: M(4), created_at: ts(18) },
    { event_id: 'e3', member_id: M(3), note: 'Got the post driver', created_by: M(3), created_at: ts(4) },
  ]
  const stand_claims = [
    { id: 'k1', stand_id: 'p2', member_id: M(1), date: sat, sit: 'am', note: null, created_by: M(1), created_at: ts(3), released_at: null, released_by: null },
    { id: 'k2', stand_id: 'p1', member_id: M(3), date: sat, sit: 'am', note: 'Bringing my nephew', created_by: M(3), created_at: ts(2), released_at: null, released_by: null },
    { id: 'k3', stand_id: 'p3', member_id: M(4), date: addDays(sat, 1), sit: 'pm', note: null, created_by: M(4), created_at: ts(1), released_at: null, released_by: null },
  ]
  const checkouts = [
    { id: 'o1', member_id: M(3), event_id: null, left_at: ts(9, 14), items: checklist.map((c, i) => ({ id: c.id, title: c.title, done: i !== 20 })), all_done: false, notes: 'Propane is getting low.', created_by: M(3), created_at: ts(9, 14), deleted_at: null },
  ]
  const feeder_fills = [
    { id: 'f1', feeder_id: 'p5', filled_at: ts(3, 11), amount: '200 lb', feed_type: 'corn', created_by: M(4), created_at: ts(3, 11), deleted_at: null },
    { id: 'f2', feeder_id: 'p6', filled_at: ts(25, 10), amount: '100 lb', feed_type: 'protein', created_by: M(3), created_at: ts(25, 10), deleted_at: null },
  ]
  const sightings = [
    { id: 's1', species: 'Deer', description: 'Big 8, heavy', count: 1, seen_at: ts(2, 7), pin_id: 'p2', lat: null, lng: null, notes: 'Came in from the creek side right at first light.', ...base(2), created_by: M(1) },
    { id: 's2', species: 'Hog', description: 'Sow with 6 piglets', count: 7, seen_at: ts(5, 18), pin_id: 'p5', lat: null, lng: null, notes: null, ...base(5), created_by: M(4) },
    { id: 's3', species: 'Turkey', description: 'Flock', count: 12, seen_at: ts(9, 8), pin_id: 'p1', lat: null, lng: null, notes: null, ...base(9), created_by: M(3) },
  ]
  const y = Number(today.slice(0, 4)); const seasonYear = Number(today.slice(5, 7)) >= 9 ? y : y - 1
  const harvests = [
    { id: 'h1', member_id: M(3), harvested_on: `${seasonYear}-11-08`, species: 'Deer', sex: 'buck', description: '10 point, 138"', pin_id: 'p1', lat: null, lng: null, notes: null, tag_number: 'A-4471', logged_on_license: true, ...base(30) , created_by: M(3) },
    { id: 'h2', member_id: M(1), harvested_on: `${seasonYear}-11-15`, species: 'Deer', sex: 'doe', description: null, pin_id: 'p2', lat: null, lng: null, notes: 'Management doe', tag_number: null, logged_on_license: false, ...base(20) },
    { id: 'h3', member_id: M(4), harvested_on: `${seasonYear}-10-02`, species: 'Hog', sex: 'male', description: '180 lb boar', pin_id: 'p5', lat: null, lng: null, notes: null, tag_number: null, logged_on_license: false, ...base(40), created_by: M(4) },
  ]
  const log_entries = [
    { id: 'l1', body: 'Fence down by the north gate, hogs pushed it over. Needs two T-posts and a stretch of wire.', pin_id: 'p11', lat: null, lng: null, ...base(1), created_by: M(3) },
    { id: 'l2', body: 'Creek crossing is washed out below the tank. Mule can still make it, truck cannot.', pin_id: 'p10', lat: null, lng: null, ...base(4), created_by: M(4) },
    { id: 'l3', body: 'Filled the propane at the house. Gauge reads 70%.', pin_id: null, lat: null, lng: null, ...base(9), created_by: M(3) },
  ]
  const comments = [
    { id: 'cm1', parent_type: 'log_entry', parent_id: 'l1', body: "I've got posts in the barn. Can fix it Saturday.", ...base(1), created_by: M(1) },
  ]
  const todos = [
    { id: 't1', title: 'Fix the north fence', notes: 'Two T-posts and wire. Posts are in the barn.', assignee_id: M(3), due_on: addDays(today, 6), pin_id: 'p11', status: 'open', completed_by: null, completed_at: null, ...base(1) },
    { id: 't2', title: 'Replace Plot Cam batteries', notes: null, assignee_id: M(1), due_on: addDays(today, -2), pin_id: 'p7', status: 'open', completed_by: null, completed_at: null, ...base(10), created_by: M(4) },
    { id: 't3', title: 'Grade the road to the tank', notes: null, assignee_id: null, due_on: null, pin_id: null, status: 'open', completed_by: null, completed_at: null, ...base(12) },
    { id: 't4', title: 'Mow around the cabin', notes: null, assignee_id: M(5), due_on: null, pin_id: null, status: 'done', completed_by: M(5), completed_at: ts(3), ...base(15) },
  ]
  const supply_items = [
    { id: 'su1', name: 'Corn (50 lb bags)', notes: '6 bags', is_inventory: true, level: 'low', needed: true, got_by: null, got_at: null, ...base(20) },
    { id: 'su2', name: 'Protein pellets', notes: null, is_inventory: true, level: 'some', needed: false, got_by: null, got_at: null, ...base(20) },
    { id: 'su3', name: 'Propane', notes: null, is_inventory: true, level: 'full', needed: false, got_by: null, got_at: null, ...base(20) },
    { id: 'su4', name: 'AA batteries', notes: 'For the cameras', is_inventory: false, level: null, needed: true, got_by: null, got_at: null, ...base(3), created_by: M(4) },
    { id: 'su5', name: 'Gate latch', notes: null, is_inventory: false, level: null, needed: true, got_by: null, got_at: null, ...base(2), created_by: M(3) },
    { id: 'su6', name: 'Trash bags', notes: null, is_inventory: false, level: null, needed: false, got_by: M(2), got_at: ts(8), ...base(12), created_by: M(2) },
  ]
  const checkins = [
    { id: 'ci1', member_id: M(3), arrived_at: ts(0, 6), expected_back: null, note: 'Sitting the North Ladder', left_at: null, left_by: null, created_by: M(3), created_at: ts(0, 6) },
  ]
  return { members, checklist_items: checklist, settings, pins, areas, events, event_attendees, stand_claims, checkouts, feeder_fills, sightings, harvests, log_entries, comments, todos, supply_items, checkins }
}
