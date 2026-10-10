# Back 40

A shared app for one family hunting property. Who's hunting where, what's happening on the place, what needs doing, and what we need to buy. See `SPEC.md` for features and `CLAUDE.md` for how it's built.

**Stack:** Vite + React + TypeScript + Tailwind, PWA (`vite-plugin-pwa`), Supabase (Postgres, Storage, Edge Functions, Realtime), Leaflet, Web Push, Vercel.

## Status

| Phase | What | State |
| --- | --- | --- |
| 1 | Scaffold, PWA install, Supabase, identity/onboarding, members admin | **Done** |
| 2 | Calendar (just us / come join), check-out list, emergency info, Home | **Done** |
| 3 | Satellite map, pins, boundary and areas, stand sign-up | **Done** |
| 4 | Feeders with due colors, sightings, harvests with TPWD tags, photos | **Done** |
| 5 | Log + comments, to-dos, needs/supplies, who's-on-the-place check-in | **Done** |
| 6 | Push notifications, offline outbox, CSV/JSON export, polish | Not started |

The build order was reshuffled after Phase 1: the family calendar, the before-you-leave list, and a shareable emergency address came first.

The full database schema (all tables, RLS, storage bucket) is already in `supabase/migrations/` so later phases only add UI and functions.

## How identity works

No passwords. Each phone signs in with Supabase **anonymous auth**, which gives it a real session and a row in `auth.users`. The person types the **family code**, picks their **name** from the member list, and the `join_with_code` RPC links that anonymous user to the member (`member_devices` table). From then on every row they write carries their member id in `created_by`.

Admin mode is per phone: `unlock_admin(pin)` flips `member_devices.is_admin`. The family code and admin PIN are stored as bcrypt hashes in `settings` and never leave Postgres. Row Level Security is on every table, so an anonymous user who hasn't joined can read nothing.

This is not real security (the spec says so). It keeps strangers out and makes attribution automatic.

## The property

Gonzales County, Texas, just south of Smiley. Gonzales CAD parcel **8554**, Abstract 380 (George W. Petty survey), 418.5 acres, owner Kiatta Properties LP, 1932 CR 211. The 911 address point is 29.2273, -97.6519. The parcel polygon is in `docs/parcel-8554.kml` (and as GeoJSON). The seed loads it as the property boundary; the admin can also import it from the Map tab.

## Map and stands

- **Satellite map** from Esri World Imagery through Leaflet. No API key. Tiles you've viewed are cached by the service worker for weak signal.
- **Pins**: stand, feeder, camera, water, gate, food plot, hazard, other. Each has a colored icon and a name label. Tap one for details, coordinates, Directions, and (for stands) the next claimed sits. Members add hazard and other pins; the admin adds everything else, and can edit, move, and remove.
- **Adding pins**: "Drop a pin at my location" uses the phone's GPS. "Put a pin somewhere on the map" shows a crosshair you line up by panning.
- **Boundary and areas** (admin): draw by tapping corners (Geoman), adjust corners later, or import a KML/GeoJSON file. The first imported shape becomes the boundary if there isn't one; point placemarks become pins with a type guessed from the name (gate, tank, creek, feeder…). Tap an area to rename it, make it the boundary, or remove it.
- **Stand sign-up**: the Stands tab is a week grid, stands down the side, days and AM/PM across the top. Tap a cell to claim it with an optional note, or to release your own claim. The admin can release anyone's. Postgres enforces one live claim per stand per sit. Home shows this weekend's claims.

## Feeders, sightings, harvests

- **Feeders**: each feeder pin carries "fill every N days". The Feeders screen, the Home card, and the feeder's map pin show green (fine), yellow (due), or red (overdue, 3 days past due). **Filled it** records the fill with one tap, then offers optional amount and feed type.
- **Sightings**: species chips, "looked like", count, time, a pin or GPS spot, notes, photos. Filter by species, pin, or date range.
- **Harvests**: who, date, species, sex, description or score, pin or GPS spot, Texas **tag number** and **logged on license**, notes, photos. Season totals (Sept–Aug) by person and species.
- **Photos** were cut by decision: photo storage is the one part of the stack that needs looking after over time.

## Log, to-dos, supplies, who's here

- **Log**: a running feed. Post text with an optional spot (pin or GPS). Comments on each entry. "Make a to-do" turns an entry into a to-do with the title and spot filled in.
- **To-dos**: title, notes, assignee, due date, spot. Tap the circle to mark done (records who and when) or reopen. Filters: Mine, All open, Done. Comments too.
- **Needs & supplies**: "We need" is the shopping list; "Got it" records who bought it. "On hand" tracks rough levels (full / some / low / out); low or out puts the item on the list automatically, and "Got it" sets it back to full.
- **Who's on the place**: "I'm here" with an optional "back by" time and note; "I'm out" or finishing the before-you-leave list closes it. Past the "back by" time the entry turns red; Phase 6 adds the push.

## Upkeep

The goal is near zero. What there is:

- **Supabase free tier pauses after ~7 days without traffic.** `.github/workflows/keep-alive.yml` pings the API twice a week once the repo is on GitHub with two secrets set (`SUPABASE_URL`, `SUPABASE_ANON_KEY`). If a project does get paused, the admin restores it with one click in the Supabase dashboard; no data is lost.
- **Free-tier limits** are generous for 20 people and text-only data: 500 MB database, 50,000 monthly active users. No Storage is used.
- **Vercel** redeploys on push and needs nothing between deploys.
- **Anonymous auth users** accumulate one per phone (and again if someone clears Safari data). Harmless; they can be pruned from the dashboard if it ever matters.

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

### 6. Deploy to Vercel

1. Push the repo to GitHub and import it at [vercel.com/new](https://vercel.com/new). Framework preset: **Vite**.
2. Add the two `VITE_*` environment variables to the project.
3. Deploy. `vercel.json` already rewrites all routes to `index.html` and keeps `sw.js` uncached.
4. Send the Vercel URL to the family by group text. iPhone users open it in Safari → Share → Add to Home Screen.

### 7. VAPID keys for push (Phase 5)

Generate once and keep the private key secret:

```bash
npx web-push generate-vapid-keys
```

- `VITE_VAPID_PUBLIC_KEY` goes in the app's environment (Vercel).
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` (a `mailto:` address) go in the Edge Function secrets: `npx supabase secrets set ...`.

Phase 5 adds the Edge Function and the subscription UI.

## Scripts

| Command | What |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Typecheck and production build (`dist/`) |
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

The migrations run on plain Postgres 16 if you stub the `auth` and `storage` schemas (a `auth.users` table, an `auth.uid()` function reading `request.jwt.claim.sub`, a `storage.objects` table, and a `supabase_realtime` publication). This is how Phase 1 was verified: wrong code rejected, members hidden before join, non-admin can't add members or stands, members can add hazard pins, one claim per stand per sit, switch person drops admin.

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
