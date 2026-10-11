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

### 2. Stand / Blind Sign-Up (highest priority)
- A list of stands. Each one has a name, a type (ladder, box blind, ground blind), and a map pin.
- Claim a stand for a **date + AM/PM sit**. Two people can't claim the same stand for the same sit.
- A week view grid shows stands down the side and days/sits across the top.
- A person can release their own claim. The admin can release anyone's.
- Optional note on a claim, like "bringing my nephew."

### 3. Map
- Satellite base map (Leaflet + Esri World Imagery or similar).
- The admin can draw and edit the **property boundary** and optional **named areas** (pastures, food plots). GeoJSON or shapefile import is a nice-to-have.
- Pin types each get their own icon: stand, feeder, camera, water/tank, gate, food plot, hazard, other.
- Tap a pin to see its details, recent activity (harvests, fills, notes).
- "Drop pin at my location" uses phone GPS.
- Members can add hazard and other pins. Only the admin can add, edit, or move stands, feeders, and cameras.

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
