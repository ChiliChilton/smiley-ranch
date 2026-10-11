// Drives the demo build (fake backend) through every screen. Run: npm run build:demo && npm run preview & && npm run e2e:demo
import { chromium, devices } from 'playwright'
import fs from 'node:fs/promises'

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {})
const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.error('PAGE ERROR', e.message))
page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE', m.text().slice(0, 200)) })
const shot = (n) => page.screenshot({ path: `e2e/shots/${n}.png` })
const tab = (name) => page.getByRole('link', { name, exact: true }).click()
const quick = (name) => page.getByRole('button', { name, exact: true }).click()

try {
  await page.goto('http://localhost:4173/')
  await page.getByLabel('Family code').fill('deer-camp')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Dad' }).click()
  await page.getByRole('button', { name: /Not now|Continue/ }).click()

  // Board
  await page.getByText(/Current stay|Next stay/).waitFor()
  await page.getByText('Opening weekend').first().waitFor()
  await page.getByText('Going:').waitFor()
  await page.getByText('Needs').first().waitFor()
  await shot('demo-home')

  // + Add need with a place tag, + Add project with notes and due date
  await page.getByRole('button', { name: '+ Add' }).first().click()
  await page.getByLabel('What').fill('Diesel for the tractor')
  await page.getByRole('button', { name: 'Barn', exact: true }).click()
  await page.getByLabel('Notes').fill('Two cans')
  await page.getByRole('button', { name: 'Add it', exact: true }).click()
  await page.getByText('Diesel for the tractor').waitFor()
  await page.getByRole('button', { name: '+ Add' }).nth(1).click()
  await page.getByLabel('What needs doing').fill('Spray the fence line')
  await page.getByLabel('Due (optional)').fill('2027-03-01')
  await page.getByLabel('Notes').fill('Borrow the sprayer')
  await page.getByRole('button', { name: 'Add it', exact: true }).click()
  await page.getByText('Spray the fence line').waitFor()
  await page.getByText('You · due Mar 1, 2027').waitFor() // assigned to me by default
  await page.getByRole('button', { name: 'Got it', exact: true }).first().click()
  await page.waitForTimeout(300)
  await shot('demo-home-added')

  // Calendar rules
  await tab('Calendar')
  await page.getByText('Mike + friends').first().waitFor()
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByLabel('What').fill('Dad solo')
  await page.getByRole('button', { name: 'Just us', exact: true }).click()
  const d = new Date(); const iso = (x) => `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`
  const plus = (n) => { const x = new Date(d); x.setDate(x.getDate()+n); return iso(x) }
  await page.getByLabel('From').fill(plus(13)); await page.getByLabel('To').fill(plus(15))
  await page.getByRole('button', { name: 'Add it', exact: true }).click()
  await page.getByText('Uncle Mike already has the place those dates').waitFor()
  await page.getByRole('button', { name: 'Come join', exact: true }).click()
  await page.getByRole('button', { name: 'Add it', exact: true }).click()
  await page.getByText('Someone else has these dates').waitFor()
  await page.getByRole('button', { name: 'Add it anyway', exact: true }).click()
  await page.getByText("Who's going (1)").waitFor()

  // Stands: empty until the admin places pins; back goes Home
  await tab('Home')
  await quick('Stands')
  await page.getByText('No stands on the map yet').waitFor()
  await shot('demo-stands-empty')
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await page.getByText(/Current stay|Next stay/).waitFor()

  // Admin: add a feeder on the map with days-per-bag, then a stand
  await tab('More')
  await page.getByRole('button', { name: 'Unlock admin' }).click()
  await page.getByLabel('Admin PIN').fill('4321')
  await page.getByRole('button', { name: 'Unlock', exact: true }).click()
  await page.getByText('Admin mode is on').waitFor()
  await tab('Home')
  await quick('Map')
  await page.waitForTimeout(600)
  if (await page.locator('.pin-icon').count()) throw new Error('map should start with no markers')
  await shot('demo-map-clean')
  await page.getByRole('button', { name: 'Add to the map' }).click()
  await page.getByText('Put a pin somewhere on the map').click()
  await page.getByRole('button', { name: 'Put pin here', exact: true }).click()
  await page.getByLabel('Name').fill('Plot Feeder')
  await page.getByRole('button', { name: /Feeder$/ }).click()
  await page.getByLabel('A bag lasts about (days)').fill('4')
  await page.getByRole('button', { name: 'Add pin', exact: true }).click()
  await page.locator('.pin-label', { hasText: 'Plot Feeder' }).waitFor()
  await page.getByRole('button', { name: 'Add to the map' }).click()
  await page.getByText('Put a pin somewhere on the map').click()
  await page.getByRole('button', { name: 'Put pin here', exact: true }).click()
  await page.getByLabel('Name').fill('Box Blind')
  await page.getByRole('button', { name: 'Box blind', exact: true }).click()
  await page.getByRole('button', { name: 'Add pin', exact: true }).click()
  await page.locator('.pin-label', { hasText: 'Box Blind' }).waitFor()
  await page.getByRole('button', { name: 'Back', exact: true }).click()

  // Feeders: fill with bags -> run-out estimate
  await quick('Feeders')
  await page.getByText('Never filled').waitFor()
  await page.getByRole('button', { name: 'Filled it', exact: true }).click()
  await page.getByLabel('How many bags').fill('3')
  await page.getByText('Should last about 12 days').waitFor()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByText(/Runs out about/).waitFor()
  await page.getByText('3 bags').waitFor()
  await shot('demo-feeders')
  await page.getByRole('button', { name: 'Back', exact: true }).click()

  // Stands: day picker, claim and release
  await quick('Stands')
  await page.getByRole('button', { name: /^Box Blind, .* AM, open$/ }).click()
  await page.getByLabel('Note (optional)').fill('Bringing my nephew')
  await page.getByRole('button', { name: 'Claim stand', exact: true }).click()
  await page.getByRole('button', { name: /^Box Blind, .* AM, Dad$/ }).waitFor()
  await shot('demo-stands')
  await page.getByRole('button', { name: /^Box Blind, .* AM, Dad$/ }).click()
  await page.getByRole('button', { name: 'Release my claim', exact: true }).click()
  await page.getByRole('button', { name: /^Box Blind, .* AM, open$/ }).waitFor()
  await page.getByRole('button', { name: 'Back', exact: true }).click()

  // Needs tab: place filter
  await tab('Needs')
  await page.getByText(/We need \(\d\)/).waitFor()
  await page.getByRole('button', { name: 'Trailer', exact: true }).first().click()
  await page.getByText('Dish soap').waitFor().catch(() => {})
  if (await page.getByText('Gate latch').count()) throw new Error('place filter did not hide barn items')
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await shot('demo-needs')

  // Property notes -> comment -> make it a job
  await tab('Home')
  await quick('Property notes')
  await page.getByPlaceholder(/Anything the family should know/).fill('Cut fence on the east line near the gate')
  await page.getByRole('button', { name: 'Post', exact: true }).click()
  const entry = page.getByRole('button', { name: /Cut fence on the east line/ })
  await entry.waitFor()
  await entry.click()
  await page.getByPlaceholder('Add a comment').fill('I can patch it Sunday')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await page.getByText('I can patch it Sunday').waitFor()
  await page.getByRole('button', { name: 'Make it a job', exact: true }).click()
  await page.getByText('New project or job').waitFor()
  await page.getByRole('button', { name: 'Add it', exact: true }).click()
  await page.getByText('Cut fence on the east line').waitFor()
  await shot('demo-projects')

  // Hunting seasons: on the calendar, and the admin can add one
  await tab('Calendar')
  await page.getByText('Hunting seasons').waitFor()
  await page.getByText('Open now').waitFor()
  await page.getByText(/Deer · Archery/).first().waitFor()
  await page.getByText(/Next ·/).waitFor()
  await shot('demo-calendar-seasons')
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('button', { name: 'Add a season' }).click()
  await page.getByRole('button', { name: 'Other', exact: true }).click()
  await page.getByLabel('Season', { exact: true }).fill('Hog hunt weekend')
  await page.getByLabel('From').fill('2027-02-05')
  await page.getByLabel('To').fill('2027-02-07')
  await page.getByRole('button', { name: 'Add it', exact: true }).click()
  await page.getByText('Other · Hog hunt weekend').waitFor()
  await shot('demo-admin-seasons')
  await tab('Home')
  await page.getByText('In season:').waitFor()

  // Check out tab: closes the list
  await tab('Check out')
  await page.getByText('Empty the dishwasher').waitFor()
  await page.getByRole('button', { name: /I'm heading out/ }).click()
  await page.getByText("You're checked out.").waitFor()
  await page.getByRole('button', { name: 'Back home', exact: true }).click()

  // Offline outbox
  await tab('More')
  await page.getByText("Pretend there's no signal").click()
  await tab('Home')
  await quick('Property notes')
  await page.getByPlaceholder(/Anything the family should know/).fill('Posted with no signal')
  await page.getByRole('button', { name: 'Post', exact: true }).click()
  await page.getByText('1 entry waiting for signal').waitFor()
  await shot('demo-outbox')
  await tab('More')
  await page.getByText("Pretend there's no signal").click()
  await page.waitForTimeout(800)
  if (await page.getByText('waiting for signal').count()) throw new Error('outbox did not flush')

  // Export (KML has the boundary and the pins we added)
  await page.getByRole('button', { name: 'Export data' }).click()
  const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null)
  await page.getByRole('button', { name: 'Export map (KML)' }).click()
  const got = await dl
  if (got) { const txt = await fs.readFile(await got.path(), 'utf8'); if (!/Property boundary/.test(txt) || !/Plot Feeder/.test(txt)) throw new Error('KML missing content') }
  await page.getByText(/Downloaded|Sent to the share sheet/).waitFor()

  console.log('DEMO OK')
} catch (e) {
  console.error(String(e).split('\n').slice(0, 6).join('\n'))
  await page.screenshot({ path: 'e2e/shots/DEMO-FAIL.png' }).catch(() => {})
  process.exitCode = 1
}
await browser.close()
