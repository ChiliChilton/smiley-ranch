// Smoke test for the UI (Phases 1-2) with a mocked Supabase backend.
//
//   VITE_SUPABASE_URL=https://mock.supabase.co VITE_SUPABASE_ANON_KEY=test npm run build
//   npm run preview &
//   npx playwright install chromium   (once)
//   npm run e2e
//
// Walks install -> join -> pick name -> notifications -> home -> admin unlock ->
// members -> change family code -> checklist + emergency admin -> switch person -> deactivated,
// plus calendar (exclusive blocked, inclusive warns, I'm in with note) and check-out
// at 375px (browser) and 430px (standalone). Screenshots land in e2e/shots/.
import { chromium, devices } from 'playwright'
import fs from 'node:fs'

const BASE = process.env.BASE ?? 'http://localhost:4173'
const OUT = process.env.OUT ?? './e2e/shots'
fs.mkdirSync(OUT, { recursive: true })

// ---- mock Supabase state ----
const seedMembers = () => [
  { id: 'm1', name: 'Dad', is_active: true, created_by: null, created_at: 'x', updated_at: 'x' },
  { id: 'm2', name: 'Uncle Mike', is_active: true, created_by: null, created_at: 'x', updated_at: 'x' },
  { id: 'm3', name: 'Cousin Sam', is_active: true, created_by: null, created_at: 'x', updated_at: 'x' },
]
let members = seedMembers()
const today = new Date(); const iso = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const plus = (n) => { const d = new Date(today); d.setDate(d.getDate()+n); return iso(d) }
const seedEvents = () => [
  { id: 'e1', title: 'Mike + friends', kind: 'exclusive', starts_on: plus(12), ends_on: plus(14), notes: 'Have the place to ourselves.', created_by: 'm2', created_at: 'x', updated_at: 'x', deleted_at: null },
  { id: 'e2', title: 'Work day', kind: 'inclusive', starts_on: plus(20), ends_on: plus(20), notes: null, created_by: 'm1', created_at: 'x', updated_at: 'x', deleted_at: null },
]
let events = seedEvents()
let attendees = []
const seedChecklist = () => [
  { id: 'c1', title: 'Turn off the water', sort_order: 1, created_by: 'm1', created_at: 'x', updated_at: 'x', deleted_at: null },
  { id: 'c2', title: 'Lock the front gate', sort_order: 2, created_by: 'm1', created_at: 'x', updated_at: 'x', deleted_at: null },
]
let checklist = seedChecklist()
let checkouts = []
let settings = { emergency_address: '1234 County Road 100, Llano, TX 78643', emergency_lat: '30.7560', emergency_lng: '-98.6745', emergency_directions: 'Green pipe gate on the left.', emergency_extra: '' }
const overlap = (a, b) => a.starts_on <= b.ends_on && b.starts_on <= a.ends_on
// minimal PostgREST filter support: col=eq.x, col=is.null, col=gte.x, col=lte.x, col=neq.x
function applyFilters(rows, sp) {
  for (const [k, v] of sp.entries()) {
    if (['select','order','limit','on_conflict'].includes(k)) continue
    const [op, ...rest] = v.split('.'); const val = rest.join('.')
    rows = rows.filter((r) => {
      const x = r[k]
      if (op === 'eq') return String(x) === val
      if (op === 'neq') return String(x) !== val
      if (op === 'is') return val === 'null' ? x == null : Boolean(x) === (val === 'true')
      if (op === 'gte') return x >= val
      if (op === 'lte') return x <= val
      return true
    })
  }
  return rows
}
function restTable(name) {
  return { events, event_attendees: attendees, checklist_items: checklist, checkouts, members }[name]
}
let secrets = { code: 'deer-camp', pin: '4321' }
let device = { member_id: null, is_admin: false }
const me = () => {
  const m = members.find((x) => x.id === device.member_id)
  return m
    ? { member_id: m.id, name: m.name, is_active: m.is_active, is_admin: device.is_admin && m.is_active }
    : { member_id: null, name: null, is_active: false, is_admin: false }
}
const pgErr = (code, message) => ({ status: 400, contentType: 'application/json', body: JSON.stringify({ code, message, details: null, hint: null }) })
const json = (body, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

const calls = []
async function mock(route) {
  const req = route.request()
  const url = new URL(req.url())
  const path = url.pathname
  const method = req.method()
  const body = method === 'POST' || method === 'PATCH' ? req.postDataJSON?.() ?? {} : {}
  calls.push(`${method} ${path}`)
  if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })

  if (path === '/auth/v1/signup') {
    const now = Math.floor(Date.now() / 1000)
    return route.fulfill(json({
      access_token: 'tok', token_type: 'bearer', expires_in: 36000, expires_at: now + 36000, refresh_token: 'ref',
      user: { id: 'u1', aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
    }))
  }
  if (path === '/rest/v1/rpc/whoami') return route.fulfill(json(me()))
  if (path === '/rest/v1/rpc/list_members_with_code') {
    if (body.code?.trim() !== secrets.code) return route.fulfill(pgErr('28P01', 'That family code is not right'))
    return route.fulfill(json(members.filter((m) => m.is_active).map(({ id, name }) => ({ id, name }))))
  }
  if (path === '/rest/v1/rpc/join_with_code') {
    if (body.code?.trim() !== secrets.code) return route.fulfill(pgErr('28P01', 'That family code is not right'))
    device = { member_id: body.member_id, is_admin: false }
    return route.fulfill(json(me()))
  }
  if (path === '/rest/v1/rpc/switch_member') { device = { member_id: body.member_id, is_admin: false }; return route.fulfill(json(me())) }
  if (path === '/rest/v1/rpc/unlock_admin') {
    if (body.pin?.trim() !== secrets.pin) return route.fulfill(pgErr('28P01', 'That PIN is not right'))
    device.is_admin = true; return route.fulfill(json(me()))
  }
  if (path === '/rest/v1/rpc/lock_admin') { device.is_admin = false; return route.fulfill(json(me())) }
  if (path === '/rest/v1/rpc/set_family_code') { if (!device.is_admin) return route.fulfill(pgErr('42501', 'Admin only')); secrets.code = body.new_code; return route.fulfill({ status: 204 }) }
  if (path === '/rest/v1/rpc/set_admin_pin') { if (!device.is_admin) return route.fulfill(pgErr('42501', 'Admin only')); secrets.pin = body.new_pin; return route.fulfill({ status: 204 }) }
  if (path === '/rest/v1/settings') {
    if (method === 'GET') return route.fulfill(json(Object.entries(settings).map(([key, value]) => ({ key, value, updated_at: 'x' }))))
    if (method === 'POST') { if (!device.is_admin) return route.fulfill(pgErr('42501', 'new row violates row-level security policy')); for (const r of (Array.isArray(body) ? body : [body])) settings[r.key] = r.value; return route.fulfill(json([], 201)) }
  }
  const generic = ['events', 'event_attendees', 'checklist_items', 'checkouts']
  const tname = path.replace('/rest/v1/', '')
  if (generic.includes(tname)) {
    const rows = restTable(tname)
    const single = (req.headers()['accept'] ?? '').includes('application/vnd.pgrst.object')
    const out = (list, status = 200) => route.fulfill(json(single ? (list[0] ?? null) : list, status))
    if (method === 'GET') {
      let list = applyFilters(rows, url.searchParams)
      const ord = url.searchParams.getAll('order')
      for (const o of ord.reverse()) { const [col, dir] = o.split('.'); list = [...list].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (dir === 'desc' ? -1 : 1)) }
      const lim = url.searchParams.get('limit'); if (lim) list = list.slice(0, Number(lim))
      if (single && list.length === 0) return route.fulfill(pgErr('PGRST116', 'no rows'))
      return out(list)
    }
    if (method === 'POST') {
      if (tname === 'checklist_items' && !device.is_admin) return route.fulfill(pgErr('42501', 'new row violates row-level security policy for table "checklist_items"'))
      const inserted = []
      for (const r of (Array.isArray(body) ? body : [body])) {
        const row = { id: tname[0] + (rows.length + 1), created_by: device.member_id, created_at: new Date().toISOString(), updated_at: 'x', deleted_at: null, left_at: new Date().toISOString(), notes: null, note: null, ...r }
        if (tname === 'events' && row.kind === 'exclusive') {
          const clash = rows.find((e) => e.kind === 'exclusive' && !e.deleted_at && overlap(e, row))
          if (clash) return route.fulfill(pgErr('23P01', `${members.find((m) => m.id === clash.created_by)?.name} already has the place those dates (${clash.title})`))
        }
        rows.push(row); inserted.push(row)
      }
      return out(inserted, 201)
    }
    if (method === 'PATCH') {
      const list = applyFilters(rows, url.searchParams)
      for (const r of list) Object.assign(r, body)
      return out(list)
    }
    if (method === 'DELETE') {
      const list = applyFilters(rows, url.searchParams)
      for (const r of list) rows.splice(rows.indexOf(r), 1)
      return out(list)
    }
  }
  if (path === '/rest/v1/members') {
    if (method === 'GET') {
      let rows = members
      const act = url.searchParams.get('is_active'); if (act) rows = rows.filter((m) => String(m.is_active) === act.replace('eq.', ''))
      return route.fulfill(json([...rows].sort((a, b) => a.name.localeCompare(b.name))))
    }
    if (method === 'POST') {
      if (!device.is_admin) return route.fulfill(pgErr('42501', 'new row violates row-level security policy for table "members"'))
      const rows = Array.isArray(body) ? body : [body]
      for (const r of rows) members.push({ id: 'm' + (members.length + 1), name: r.name, is_active: true, created_by: device.member_id, created_at: 'x', updated_at: 'x' })
      return route.fulfill(json(rows, 201))
    }
    if (method === 'PATCH') {
      const id = url.searchParams.get('id')?.replace('eq.', '')
      const m = members.find((x) => x.id === id)
      if (m && device.is_admin) Object.assign(m, body)
      return route.fulfill(json([m], 200))
    }
  }
  return route.fulfill(json({ message: `unmocked ${method} ${path}` }, 404))
}

// ---- helpers ----
const assert = (cond, msg) => { if (!cond) throw new Error('ASSERT: ' + msg) }
async function shot(page, name) { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false }) }

async function run(width, standalone) {
  const tag = `${width}${standalone ? '-standalone' : ''}`
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
  const ctx = await browser.newContext({
    ...devices['iPhone 13'],
    viewport: { width, height: width === 375 ? 667 : 932 },
    serviceWorkers: 'block',
  })
  if (standalone) await ctx.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { get: () => true }) })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => { console.error('PAGE ERROR', e); process.exitCode = 1 })
  await page.route('https://mock.supabase.co/**', mock)
  device = { member_id: null, is_admin: false }
  secrets = { code: 'deer-camp', pin: '4321' }
  members = seedMembers()
  events = seedEvents(); attendees = []; checkouts = []; checklist = seedChecklist()

  await page.goto(BASE)
  if (!standalone) {
    await page.getByText('Tap the Share button').waitFor()
    await shot(page, `${tag}-1-install`)
    await page.getByRole('button', { name: /Skip for now/ }).click()
  }
  await page.getByLabel('Family code').waitFor()
  await shot(page, `${tag}-2-join`)
  await page.getByLabel('Family code').fill('wrong')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByText('That family code is not right').waitFor()
  await page.getByLabel('Family code').fill('deer-camp')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByText('Who are you?').waitFor()
  await shot(page, `${tag}-3-pick`)
  await page.getByRole('button', { name: 'Dad' }).click()
  await page.getByRole('heading', { name: 'Notifications' }).waitFor()
  await shot(page, `${tag}-4-notif`)
  await page.getByRole('button', { name: /Not now|Continue/ }).click()
  await page.getByText("This weekend's stands").waitFor()
  await shot(page, `${tag}-5-home`)
  await page.getByRole('button', { name: 'Add' }).click()
  await page.getByText('Sighting').waitFor()
  await shot(page, `${tag}-5b-add`)
  await page.getByText('Close', { exact: true }).click()
  await page.getByText('1234 County Road 100').waitFor()

  // Calendar: exclusive overlap blocked, inclusive warns, I'm in with a note
  await page.getByRole('link', { name: 'Calendar' }).click()
  await page.getByText('Mike + friends').first().waitFor()
  await shot(page, `${tag}-12-calendar`)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByLabel('What').fill('Dad solo')
  await page.getByRole('button', { name: 'Just us' }).click()
  await page.getByLabel('From').fill(plus(13))
  await page.getByLabel('To').fill(plus(15))
  await page.getByRole('button', { name: 'Add it' }).click()
  await page.getByText('Uncle Mike already has the place those dates').waitFor()
  await shot(page, `${tag}-13-exclusive-blocked`)
  await page.getByRole('button', { name: 'Come join' }).click()
  await page.getByLabel('What').fill('Quick trip')
  await page.getByRole('button', { name: 'Add it' }).click()
  await page.getByText('Someone else has these dates').waitFor()
  await shot(page, `${tag}-14-inclusive-warn`)
  await page.getByRole('button', { name: 'Add it anyway' }).click()
  await page.getByText("Who's going (1)").waitFor()
  await shot(page, `${tag}-15-event`)
  await page.getByRole('button', { name: "I'm out" }).click()
  await page.getByText("Who's going (0)").waitFor()
  await page.getByRole('button', { name: "I'm in" }).click()
  await page.getByLabel('Note (optional)').fill('Bringing my nephew')
  await page.getByRole('button', { name: 'Count me in' }).click()
  await page.getByText('Bringing my nephew').waitFor()
  assert(attendees.length === 1 && attendees[0].note === 'Bringing my nephew', 'attendee note saved')

  // Check out
  await page.getByRole('link', { name: 'Home' }).click()
  await page.getByRole('button', { name: /Heading out/ }).click()
  await page.getByText('Turn off the water').waitFor()
  await page.getByRole('button', { name: 'Turn off the water' }).click()
  await shot(page, `${tag}-16-checkout`)
  await page.getByRole('button', { name: /I'm heading out/ }).click()
  await page.getByText("You're checked out.").waitFor()
  await page.getByText('Skipped: Lock the front gate').waitFor()
  assert(checkouts.length === 1 && checkouts[0].all_done === false, 'checkout saved')
  await page.getByRole('button', { name: 'Back home' }).click()
  await page.getByText('Last out:').waitFor()

  // More: unlock admin
  await page.getByRole('link', { name: 'More' }).click()
  await page.getByText('Everything you post shows this name.').waitFor()
  await shot(page, `${tag}-6-more`)
  await page.getByRole('button', { name: 'Unlock admin' }).click()
  await page.getByLabel('Admin PIN').fill('0000')
  await page.getByRole('button', { name: 'Unlock' }).click()
  await page.getByText('That PIN is not right').waitFor()
  await page.getByLabel('Admin PIN').fill('4321')
  await page.getByRole('button', { name: 'Unlock' }).click()
  await page.getByText('Admin mode is on').waitFor()
  await shot(page, `${tag}-7-more-admin`)

  // Members
  await page.getByRole('button', { name: 'Members' }).click()
  await page.getByText('Active (3)').waitFor()
  await page.getByPlaceholder('Name, like Uncle Mike').fill('Jake')
  await page.getByRole('button', { name: 'Add' }).click()
  await page.getByText('Active (4)').waitFor()
  await shot(page, `${tag}-8-members`)
  await page.getByRole('button', { name: 'Cousin Sam' }).click()
  await page.getByLabel('Name').fill('Sam')
  await page.getByRole('button', { name: 'Rename' }).click()
  await page.getByRole('button', { name: 'Sam', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Sam', exact: true }).click()
  await shot(page, `${tag}-8b-edit`)
  await page.getByRole('button', { name: 'Turn off access' }).click()
  await page.getByText('Turned off (1)').waitFor()
  assert(!members.find((m) => m.name === 'Sam').is_active, 'Sam deactivated')

  // Security
  await page.getByRole('button', { name: 'Back' }).click()
  await page.getByRole('button', { name: /Family code/ }).click()
  await page.getByLabel('New family code').fill('new-code')
  await page.getByLabel('Type it again').first().fill('new-cod')
  await page.getByText("Doesn't match.").waitFor()
  await page.getByLabel('Type it again').first().fill('new-code')
  await page.getByRole('button', { name: 'Save' }).first().click()
  await page.getByText('Family code changed').waitFor()
  assert(secrets.code === 'new-code', 'code changed')
  await shot(page, `${tag}-9-security`)

  // Admin: checklist and emergency info
  await page.getByRole('button', { name: 'Back' }).click()
  await page.getByRole('button', { name: 'Check-out list' }).click()
  await page.getByPlaceholder('Lock the front gate').fill('Take the trash out')
  await page.getByRole('button', { name: 'Add' }).click()
  await page.getByText('3.').waitFor()
  await page.getByRole('button', { name: 'Move up' }).nth(2).click()
  await page.waitForTimeout(200)
  assert(checklist.find((c) => c.title === 'Take the trash out').sort_order < checklist.find((c) => c.title === 'Lock the front gate').sort_order, 'reordered')
  await shot(page, `${tag}-17-admin-checklist`)
  await page.getByRole('button', { name: 'Back' }).click()
  await page.getByRole('button', { name: 'Emergency info' }).click()
  await page.getByLabel('Anything else').fill('Sheriff: (325) 247-5767')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByText('Saved.').waitFor()
  assert(settings.emergency_extra === 'Sheriff: (325) 247-5767', 'settings saved')
  await shot(page, `${tag}-18-admin-emergency`)

  // Switch person
  await page.getByRole('button', { name: 'Back' }).click()
  await page.getByRole('button', { name: 'Switch person' }).click()
  await page.getByText('Admin mode will turn off').waitFor()
  await page.getByRole('button', { name: 'Uncle Mike' }).click()
  await page.getByText(/, Uncle/).waitFor()
  await page.getByRole('link', { name: 'More' }).click()
  await page.getByRole('button', { name: 'Unlock admin' }).waitFor() // admin dropped
  await shot(page, `${tag}-10-switched`)

  // Deactivated member sees the inactive screen on reload
  members.find((m) => m.id === 'm2').is_active = false
  await page.reload()
  await page.getByText('Access turned off').waitFor()
  await shot(page, `${tag}-11-inactive`)

  await browser.close()
  console.log(`OK ${tag} (${calls.length} requests)`)
}

await run(375, false)
await run(430, true)
