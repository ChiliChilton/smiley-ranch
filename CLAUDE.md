# CLAUDE.md: Smiley Ranch (working name Back 40)

Read `SPEC.md` first. It's the source of truth for features. This file covers how to build them.

## Stack (don't substitute without asking)
- **Frontend:** Vite + React + TypeScript, Tailwind CSS
- **PWA:** `vite-plugin-pwa` with a manifest, icons (including a 180×180 apple-touch-icon), and a service worker
- **Backend:** Supabase. Use Postgres, Edge Functions, and Realtime. No Storage (photos were cut to keep upkeep near zero).
- **Map:** Leaflet (`react-leaflet`) with Esri World Imagery satellite tiles. Use `leaflet-draw` or Geoman for the boundary and areas.
- **Push:** Web Push with VAPID keys, sent from a Supabase Edge Function
- **Hosting:** static. GitHub Pages workflow included; Vercel works too. Nothing paid.

## Identity model
- Each device signs in with **Supabase Anonymous Auth**, so every device gets a real session.
- A Postgres RPC `join_with_code(code, member_id)` checks the family code and links that auth user to a `members` row.
- **Row Level Security everywhere.** Only auth users linked to an active member can read or write.
- `is_admin` is granted by a separate RPC `unlock_admin(pin)`.
- Store the family code and admin PIN **hashed** in a `settings` table. Never ship them in client code.
- Every row stores `created_by` (member id). The UI always shows the member's name.

## iOS requirements (critical)
- It must look and work right when launched from the iPhone home screen. Use `display: standalone`, `apple-mobile-web-app-capable`, a proper status bar style, and safe-area insets (`env(safe-area-inset-*)`).
- Tap targets must be at least 44px. Bottom tab bar navigation. No hover-dependent UI.
- Web push only works on iOS **after** the app is installed to the home screen. Detect this and explain it in the UI.
- If the app isn't running standalone, detect that and show the "Add to Home Screen" instructions screen.
- Test layouts at 375px and 430px widths.

## Offline / weak signal
- Cache the app shell with the service worker.
- New entries go into a local outbox (IndexedDB) and sync when back online. Show a small "pending sync" indicator.
- Cache recently viewed map tiles where practical.

## Data
- Write SQL migrations in `supabase/migrations/`.
- Core tables: `members`, `settings`, `pins`, `areas`, `stand_claims` (unique on stand_id + date + sit), `harvests`, `feeder_fills`, `log_entries`, `comments`, `events`, `event_attendees`, `todos`, `supply_items`, `checklist_items`, `checkouts`, and `push_subscriptions`. (Photos, sightings, and the who's-here check-in board were dropped by decision to keep it bare-bones.)
- Use soft delete (`deleted_at`) for user content.

## Build order
Build in this order and stop for review after each phase:
1. Scaffold, PWA install, Supabase, identity/onboarding, members admin
2. Map + pins, stands + stand sign-up, Home/Today
3. Feeders, harvests
4. Log + comments, to-dos, needs/supplies, calendar
5. Push notifications, offline outbox, CSV/JSON export, polish

Actual order used: 1 identity → 2 calendar + check-out list + emergency info → 3 map + stands → 4 feeders, harvests → 5 property notes, projects, needs → 6 push, offline, export. Sightings, photos, and the check-in board were removed afterwards.

## Style
- Earthy and simple: burnt orange / red dirt, tan, warm off-white. Muted, easy on the eyes, readable in sunlight. Dark mode is optional.
- It's a family work board, not a consumer app: flat sections with hairline rules, small radii, no floating buttons, no greetings. Needs, projects, and the calendar come first; hunting features are one tap away.
- Use plain language in the UI. Say "Claim stand," not "Create reservation."
- Keep components small. No extra libraries without a reason.

## Deliverables beyond code
- `README.md` with setup steps: create the Supabase project, run migrations, set env vars, generate VAPID keys, deploy to GitHub Pages or Vercel, set the first family code and admin PIN.
- A seed script with sample members, stands, and feeders for testing.
