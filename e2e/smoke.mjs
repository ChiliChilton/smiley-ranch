// Smoke test for the Phase 1 UI with a mocked Supabase backend.
//
//   VITE_SUPABASE_URL=https://mock.supabase.co VITE_SUPABASE_ANON_KEY=test npm run build
//   npm run preview &
//   npx playwright install chromium   (once)
//   npm run e2e
//
// Walks install -> join -> pick name -> notifications -> home -> admin unlock ->
// members (add/rename/deactivate) -> change family code -> switch person -> deactivated
// at 375px (browser) and 430px (standalone). Screenshots land in e2e/shots/.
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
