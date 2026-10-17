# Smiley Ranch (working name Back 40): Family Property App (SPEC)

> Working name. Rename anytime.

## What this is
A shared app for one family hunting property. It answers four questions for everyone in the group: who's hunting where, what's happening on the place, what needs doing, and what we need to buy. Every entry is stamped with who made it.

## Users
- **Up to 20 members**: family and regular guests.
- **1 admin**, who manages members, the family code, the map, and cleanup.
- Nearly everyone uses an iPhone. Phone-first, one-handed, used outdoors, often on weak signal.

## Identity (no passwords)
- On first open, the person enters the **family code**, then **picks their name** from the member list the admin maintains.
- That choice is remembered on the device. Everything they post is stamped with their name.
- A "Switch person" option lives in Settings, for shared devices.
- **Admin mode** is unlocked with a separate **admin PIN** on the admin's device.
- This is not real security. It's meant to keep strangers out and make attribution automatic.

## Install and onboarding
- The app is a **PWA** (installable web app). No App Store.
- The admin sends one link by group text.
- If the person isn't installed yet, the first screen shows simple illustrated steps for iPhone: open in Safari → Share → Add to Home Screen.
- After install: family code → pick name → allow notifications (optional) → home.

---

## Features (all in scope)

### 1. Home (the board)
- The current or next stay with who's going, then Needs and Projects with "+ Add" and inline Got it / Done, feeders running low, the latest property notes, and the emergency address.
- Quick links across the top to Stands, Map, Property notes, Feeders, Harvests. Tabs: Check out, Home, Calendar, Projects, Needs, More.

### 2. Blinds (highest priority)
- Blinds are hunting spots that need upkeep, not seats to reserve. There is no sign-up; the family settles who sits where on the trip.
- One card per spot (Tank Blind, Brants Blind, Fence Blind to start; anyone can add more). Each shows: the feeder (last fill, bags, run-out guess, Filled it), feeder motor working or down, lock status, how many chairs, whether there's a trail cam and whether it's working, needs batteries or a card, or is down, a one-line "anything wrong with it", and who last checked it. Tap the status line to update any of that.
- Killed here: this season, all time, and the last one. Harvests also group by blind.
- "+ Project" on a card pre-fills a project with the blind's name and its current problem.
- Home shows "Blinds that need a look": feeders running low plus any spot with a motor down, a cam problem, or a condition note.
- Anyone adds or edits a spot (name, blind kind, feeder, bag settings, notes, optional GPS spot for a Directions link). Only the admin removes one.

### 2a. Ranch info
- One page everyone can read behind the family code: gate code, Wi-Fi, where the breaker and water shutoff are, trash day, septic and well notes, propane and feed store numbers, the co-op outage line, the neighbor. Phone numbers get a Call button. Emergency info (address, GPS, Share) is the first section.
- Admin edits lines in place under Ranch info. Values live only in the database, never in code.

### 2c. Equipment
- The house, house trailer, barn, truck, tractor, ATVs and haul trailer each have a status (Good / Needs attention / Down) and a note. Anyone can add, rename, and set them. Admin removes entries.
- Needs and projects tag a place or machine from this list (replaces the House / Trailer / Barn tags), so the equipment card shows what's open on it.

### 2d. Trips
- Home shows "At the ranch now" when a trip is happening, otherwise "Next trip".
- When you say you're in, you give a headcount. The trip shows "6 people, 4 beds" (beds is a setting) and turns red when there are more people than beds.

### 2e. Fishing
- Front Tank (about 1 acre) and Big Lake (about 5 acres) are waters; anyone can add one. Each card shows water level (Full / Down some / Low), a condition line and photo, who last checked, this year's and all-time catch counts, the best fish, and the last one.
- Catch log: who, date, which water, species, weight, length, bait, let it go, notes, photo.
- A water can have a well with named valves (Big Lake: a well, two valves). Status shows well running or off and each valve open or closed, with who last checked.

### 2f. Photos
- One optional photo on a harvest, a catch, a property note, a project update (comment), and a blind's or water's condition. Not on needs, projects themselves, or the calendar.
- Photos are shrunk on the phone to about 1280px before upload. They live in one Supabase Storage bucket (free tier) and the app cleans it itself: anything older than a year or past the newest 250 is deleted the next time someone opens the app. It's a work board, not an album; keepers go on your own phone.

### 2b. Hunting seasons
- Texas seasons for the place (South Zone, Gonzales County) show as a one-line ribbon above the calendar and on Home: what's in season now and what's next. The calendar days themselves only show trips.
- The admin keeps the list under More > Hunting seasons: species, name, from, to, note. Each year's dates come from the TPWD Outdoor Annual; `supabase/property.sql` ships 2026-27.

### 3. Map
Dropped by decision (Oct 2026): the satellite map, boundary drawing, and KML import/export were the biggest piece of the app and the only outside service it pulled from at runtime. Blinds and feeders are set up from a list under Blinds (admin taps Add). A blind can carry an optional GPS spot, captured once with "Use my location", which gives everyone a Directions link that opens their maps app. The pins and areas tables stay, so the map could come back as a frontend-only change.

### 4. Sightings Log
Dropped by decision (Oct 2026).

### 5. Harvest Log
- Captures who, date, species, sex, description/score, stand or location, Texas tag number, logged-on-license, and notes.
- Season totals by person and species.

### 6. Feeder Tracker
- Each feeder shows its last fill: when, who, how many bags, and the feed type.
- A "Filled it" button sets the date, time, and person in one tap, then asks how many bags (optional).
- The admin sets how long one bag lasts in each feeder. The app guesses the run-out date: **yellow** within 2 days of running out, **red** when it's probably empty. A fixed days-between-fills interval is the fallback when bags aren't recorded.

### 7. Property Notes (the log)
- A running "what happened" timeline, like "fence down by north gate" or "creek crossing washed out."
- Text plus an optional map pin.
- Comments on entries.

### 8. Calendar
- Work days, opening weekends, hunts, guest visits, and season dates.
- An event has a title, date or date range, notes, and an optional list of who's attending (people tap "I'm in").
- Stand claims also show on the calendar.

### 9. To-Dos
- A to-do has a title, notes, an optional assignee, an optional due date, and an optional map pin.
- Statuses are open and done. Record who completed it and when.
- Filters: mine, all open, done.

### 10. Needs / Supplies
- **Shopping list:** "we need" items like corn, protein, batteries, or a gate latch, each tagged House / Trailer / Barn. Mark an item **got it**, which records who bought it.
- **Inventory:** items with a rough on-hand level (full / some / low / out). Setting an item to low or out automatically adds it to the shopping list.

### 11. Photos
Dropped by decision (Oct 2026): photo storage needs upkeep over time. Entries are text only.

### 12. Notifications (push, optional per person)
Each person chooses which of these they want:
- Someone claimed or released a stand for this coming weekend
- New harvest posted
- To-do assigned to me
- Feeder overdue (daily digest, sent to the admin only by default)
- New calendar event

### 13. Admin
- Add, rename, or deactivate members. Deactivated members keep their history.
- Change the family code and the admin PIN.
- Manage stands, feeders, cameras, the boundary, and areas.
- Edit or delete any entry.
- Export all data as CSV or JSON.

---

## Scenarios (use these to test)
1. Thursday night, Dad opens the app and sees who's in which stand Saturday AM. He claims the box blind for Sunday AM.
2. A cousin fills two feeders at noon and taps "Filled it" on each. The feeders go green.
3. Someone spots a cut fence. They drop a pin at their GPS location and post it to Property notes. The admin turns it into a to-do assigned to Uncle Mike.
4. A harvest gets posted. Everyone with harvest notifications enabled gets a push.
5. A new guest gets the link by text, installs it, enters the code, picks their name, and is in under a minute.
6. At the property with one bar of signal, someone posts a property note. It saves locally and syncs when the signal improves.

## Non-goals
- Real accounts, passwords, or email logins
- Native iOS or Android apps
- Multiple properties
- Payments or dues tracking
