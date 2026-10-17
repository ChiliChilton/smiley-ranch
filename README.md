# Smiley Ranch (Back 40)

A shared app for one family hunting property. Who's hunting where, what's happening on the place, what needs doing, and what we need to buy. See `SPEC.md` for features and `CLAUDE.md` for how it's built.

**Stack:** Vite + React + TypeScript + Tailwind, PWA (`vite-plugin-pwa`), Supabase (Postgres, Edge Functions, Realtime), Web Push, static hosting (GitHub Pages or Vercel). No map library.

## Status

| Phase | What | State |
| --- | --- | --- |
| 1 | Scaffold, PWA install, Supabase, identity/onboarding, members admin | **Done** |
| 2 | Calendar (just us / come join), check-out list, emergency info, Home | **Done** |
| 3 | Blinds and feeders as upkeep cards | **Done** (map and sign-up removed later by decision) |
| 4 | Feeders with bag-based run-out reminders, harvests with TPWD tags | **Done** |
| 5 | Property notes + comments, projects, needs with House/Trailer/Barn tags | **Done** |
| 6 | Push notifications, offline outbox, JSON/CSV export, update prompt | **Done** |

The build order was reshuffled after Phase 1: the family calendar, the before-you-leave list, and a shareable emergency address came first.

The full database schema (all tables, RLS, storage bucket) is already in `supabase/migrations/` so later phases only add UI and functions.

## How identity works

No passwords. Each phone signs in with Supabase **anonymous auth**, which gives it a real session and a row in `auth.users`. The person types the **family code**, picks their **name** from the member list, and the `join_with_code` RPC links that anonymous user to the member (`member_devices` table). From then on every row they write carries their member id in `created_by`.

Admin mode is per phone: `unlock_admin(pin)` flips `member_devices.is_admin`. The family code and admin PIN are stored as bcrypt hashes in `settings` and never leave Postgres. Row Level Security is on every table, so an anonymous user who hasn't joined can read nothing.

This is not real security (the spec says so). It keeps strangers out and makes attribution automatic.

## The property

Gonzales County, Texas, just south of Smiley. Gonzales CAD parcel **8554**, Abstract 380 (George W. Petty survey), 418.5 acres, owner Kiatta Properties LP, 1932 CR 211. The 911 address point is 29.2273, -97.6519. The parcel polygon is kept in `docs/parcel-8554.kml` for reference; the app no longer shows a map.

## Map and stands

- **Blinds and feeders** are a list anyone keeps under Blinds (Add, or tap a name): name, blind kind, whether it has its own feeder, how long a bag lasts, notes, and an optional GPS spot captured with "Use my location" that gives everyone a Directions link.
- **Adding pins**: "Drop a pin at my location" uses the phone's GPS. "Put a pin somewhere on the map" shows a crosshair you line up by panning.

## Feeders and harvests

- **Feeders**: each feeder pin carries "a bag lasts about N days" (and optionally a fixed interval as fallback). **Filled it** records the fill in one tap, then asks how many bags. The app guesses the run-out date: yellow within 2 days, red when probably empty. The morning digest uses the same estimate.
- **Sightings** were dropped by decision.
- **Ranch info**: gate code, Wi-Fi, shutoffs, trash day, septic and well notes, who to call (tap to call). Admin edits in place; everyone reads it behind the family code. Emergency info is its first section.
- **Equipment**: house, trailer, barn, truck, tractor, ATVs, haul trailer with Good / Needs attention / Down, a note, and the projects and needs tagged to each. Anyone can add a machine; admin removes. Needs and projects pick a place or machine from this list.
- **Blinds** are upkeep cards, not a sign-up: feeder with bag-based run-out and Filled it, motor working or down, lock, chairs, trail cam and its state, a condition line, who last checked, and what's been killed there. Anyone adds or edits a blind; admin removes. Home lists the ones that need a look.
- **Trips**: "At the ranch now" or "Next trip" on Home. Headcount when you say you're in, shown against the number of beds.
- **Fishing**: Front Tank and Big Lake as waters with level, condition, well and valves (Big Lake has a well with two), and a catch log (who, species, weight, bait, photo). Best fish and counts per water.
- **Photos** (one per harvest, catch, note, project update, or blind/water condition): shrunk on the phone, kept in one Storage bucket, and cleaned by the app itself (older than a year or past 250 gets deleted). Not an album.
- **Colorblind-safe trips**: "Come join" has a plus, "Just them" has a lock and a striped bar, so the two never rely on green vs orange alone.
- **Hunting seasons** (South Zone, Gonzales County) show as a one-line ribbon above the calendar and on Home: in season now, and next. Calendar days only show trips. Admin edits them under More > Hunting seasons; 2026-27 is seeded from the TPWD Outdoor Annual. Check the county page there before you hunt.
- **Harvests**: who, date, species, sex, description or score, pin or GPS spot, Texas **tag number** and **logged on license**, notes. Season totals (Sept–Aug) by person and species.
- **Photos** were cut by decision: photo storage is the one part of the stack that needs looking after over time.

## Log, to-dos, supplies, who's here

- **Property notes** (the log): a running feed. Post text with an optional spot (pin or GPS). Comments on each note. "Make it a job" turns a note into a project with the title and spot filled in.
- **Projects**: title, notes, assignee, due date, spot. Tap the circle to mark done (records who and when) or reopen. Filters: Mine, All open, Done. Comments too.
- **Needs**: "We need" is the shopping list, each item tagged House / Trailer / Barn with filters; "Got it" records who bought it. "On hand" tracks rough levels (full / some / low / out); low or out puts the item on the list automatically, and "Got it" sets it back to full.

## Offline, export, updates

- **No signal**: new harvests, property notes, feeder fills, projects, needs, and check-outs go into a local outbox (IndexedDB) and send themselves when signal returns, on app open, or when you tap the yellow "waiting for signal" pill. Calendar entries stay online-only because they can conflict.
- **Export** (admin, More → Export data): everything as one JSON file, or any table as CSV. Files go to the share sheet on iPhone or download elsewhere. Nothing is locked in.
- **Updates**: the app checks for a new build on launch and shows a "Reload" bar when one is ready.

## Upkeep

The goal is near zero. What there is:

- **Nothing to pay for.** GitHub, GitHub Pages, Supabase free tier, and Web Push are all free. No App Store, no custom domain, no SMS or email service.

- **Supabase free tier pauses after ~7 days without traffic.** `.github/workflows/keep-alive.yml` pings the API twice a week once the repo is on GitHub with two secrets set (`SUPABASE_URL`, `SUPABASE_ANON_KEY`). If a project does get paused, the admin restores it with one click in the Supabase dashboard; no data is lost.
- **Free-tier limits** are generous for 20 people and text-only data: 500 MB database, 50,000 monthly active users. No Storage is used.
- **Vercel** redeploys on push and needs nothing between deploys.
- **Anonymous auth users** accumulate one per phone (and again if someone clears Safari data). Harmless; they can be pruned from the dashboard if it ever matters.

## The board (Home)

Home is a work board: property name and date, quick links to the hunting side (Stands, Map, Property notes, Feeders, Harvests), then the **current or next stay** with who's going, **Needs** and **Projects** with a + that opens the full form and inline Got it / Done, feeders running low, the latest property notes, and the emergency address in one line. Tabs: Check out, Home, Calendar, Projects, Needs, More.

## Small things that matter

- **Weather chip** at the top of Home: current conditions at the ranch from Open-Meteo (free, no key). Tap for the NWS 7-day forecast. Hidden when it can't load.
- **Know before you go** on the Check out tab: wells running and valves open, low water, condition notes, feeders due. Each line links to where you update it.
- **Pinned notes**: the admin pins a property note and it stays at the top of Property notes and Home.
- **Needs and projects on a trip**: open a trip, add what to bring and what to get done; the item carries the trip's name everywhere and Home counts them under the stay.

## Calendar rules

- Every entry is **Come join** (anyone can tap "I'm in" and leave a note), **Just us** (that person has the place to themselves), or a **Note** (season dates, reminders).
- Two **Just us** stays can't overlap. Postgres enforces it with an exclusion constraint and a trigger that says who already has the dates.
- Adding a **Come join** stay over someone's **Just us** dates only warns: "Someone else has these dates", with the option to add it anyway.
- The admin edits the **check-out list** (More → Check-out list). Anyone leaving opens "Before you leave", ticks the steps, adds a note, and taps "I'm heading out". The last check-out shows on Home, including anything skipped.
- The admin sets the **emergency info** (More → Emergency info): 911 address, gate directions, GPS, and extras. It shows on Home with Share, Text it, Open in Maps, and Call 911.

## Setup

### 1. Create the Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. **Authentication → Sign In / Providers → Anonymous sign-ins: ON.** Nothing works without this.
3. Optional but recommended: **Authentication → Rate Limits**, lower the anonymous sign-in limit to something like 30/hour. Each new phone (or cleared Safari) creates one anonymous user.
4. Copy the **Project URL** and the **anon / publishable key** from Project Settings → API.

### 2. Run the migrations

With the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
npm install
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Or paste each file in `supabase/migrations/` into the SQL editor, in order.

### 3. Set the first family code and admin PIN

In the Supabase SQL editor (this function is not callable from the app):

```sql
select public.bootstrap_secrets('your-family-code', '1234');
```

Then add yourself as the first member:

```sql
insert into public.members (name) values ('Dad');
```

After that, the admin manages everything from the app (More → Unlock admin).

Then load the real property data (boundary, 911 address point, water features, the check-out list, emergency info):

```sql
-- paste supabase/property.sql into the SQL editor
```

For a throwaway test project you can run `supabase/seed.sql` instead. It sets family code `deer-camp`, PIN `4321`, and adds sample members, stands, and feeders. Run `property.sql` after it to get the real boundary too.

### 4. Environment variables

```bash
cp .env.example .env.local
```

| Variable | Where it comes from |
| --- | --- |
| `VITE_SUPABASE_URL` | Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Project Settings → API → anon / publishable key |

### 5. Run locally

```bash
npm run dev
```

Open the local URL on your phone (same Wi-Fi) or in a desktop browser. In a desktop browser the app shows the "Add to Home Screen" steps first; tap **Continue in the browser**.

To get a quick check of the layout, use the browser's device toolbar at 375 px and 430 px wide.

### 6. Put it online

The build is plain static files (`dist/`). It needs any HTTPS static host; the phones talk straight to Supabase.

**Option A: GitHub Pages (recommended, one account for everything)**
1. Push the repo to GitHub. In the repo: Settings → Pages → Source: **GitHub Actions**.
2. Settings → Secrets and variables → Actions: add `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
3. Every push to `main` deploys via `.github/workflows/pages.yml`. The app lives at `https://<you>.github.io/<repo>/`.
4. Send that link to the family by group text. iPhone users open it in Safari → Share → Add to Home Screen.

**Option B: Vercel**
1. Import the repo at [vercel.com/new](https://vercel.com/new). Framework preset: **Vite**.
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables and deploy. `vercel.json` handles routing.

Either way it's free and redeploys itself on push.

### 7. Notifications (optional, about ten minutes)

The app works without this. With it, phones get pushes for harvests, projects put on them, calendar entries, and a morning feeder digest. Each person picks what they want under More → Notifications.

1. Generate keys once (keep the private one secret):
   ```bash
   npx web-push generate-vapid-keys
   ```
2. Deploy the sender and give it its secrets. Pick any long random string for `PUSH_SECRET`:
   ```bash
   npx supabase functions deploy push --no-verify-jwt
   npx supabase secrets set PUSH_SECRET=<random> VAPID_PUBLIC_KEY=<public> VAPID_PRIVATE_KEY=<private> VAPID_SUBJECT=mailto:you@example.com
   ```
3. Tell Postgres where to send (SQL editor):
   ```sql
   insert into private.config (key, value) values
     ('push_url', 'https://<project-ref>.supabase.co/functions/v1/push'),
     ('push_secret', '<the same random string>');
   ```
4. Put the public key in the app build: `VITE_VAPID_PUBLIC_KEY` (GitHub secret `VAPID_PUBLIC_KEY`, or the Vercel env).
5. In the Supabase dashboard, Database → Extensions, make sure **pg_net** and **pg_cron** are enabled (the migration enables them where it can). The two scheduled jobs are created by the migration.

On iPhone, pushes only arrive once the app is on the home screen. The app explains this in the Notifications screen.

## Scripts

| Command | What |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Typecheck and production build (`dist/`). Set `VITE_BASE=/repo/` for GitHub Pages. |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | oxlint |
| `npm run typecheck` | `tsc -b` only |

## Project layout

```
supabase/migrations/   SQL migrations (schema, RLS, RPCs, storage bucket)
supabase/property.sql  Real property data for the live project (boundary, 911 point, water, check-out list)
supabase/seed.sql      Sample members, stands, feeders for a test project
src/lib/               Supabase client, session (identity), device detection
src/components/        Small shared UI pieces (Button, Screen, TabBar, Sheet…)
src/screens/           One file per screen
public/icons/          PWA icons (generated from public/icon.svg)
```

## Testing the migrations without Supabase

The migrations run on plain Postgres 16 if you stub the `auth` and `storage` schemas (a `auth.users` table, an `auth.uid()` function reading `request.jwt.claim.sub`, a `storage.objects` table, and a `supabase_realtime` publication). This is how Phase 1 was verified: wrong code rejected, members hidden before join, non-admin can't add members, anyone can add a blind, switch person drops admin.

## UI smoke test

`e2e/smoke.mjs` drives the whole Phase 1 flow in headless Chromium against a mocked Supabase API (no project needed). It runs at 375 px as a plain Safari tab and at 430 px as an installed app, and saves screenshots to `e2e/shots/`. Reference screenshots live in `docs/screenshots/`.

```bash
VITE_SUPABASE_URL=https://mock.supabase.co VITE_SUPABASE_ANON_KEY=test npm run build
npm run preview &
npx playwright install chromium   # once
npm run e2e
```

## Demo mode (review without a backend)

`npm run build:demo` builds the app with `VITE_DEMO=1`: an in-browser stand-in for Supabase (`src/lib/demo/`) with sample members, the real boundary, the check-out list, and emergency info, all kept in the viewer's localStorage. It enforces the same admin rules as the RLS policies. Family code `deer-camp`, admin PIN `4321`. Satellite tiles, GPS, push, and the service worker are off in demo mode. The output in `dist-demo/` is shaped for publishing as a claude.ai artifact; `npm run e2e:demo` smoke-tests it against `npm run preview`.
