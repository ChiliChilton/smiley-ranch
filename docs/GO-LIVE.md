# Go live (about 30 minutes, all free)

The sandbox at https://chilichilton.github.io/smiley-ranch/ becomes the real app when the
Supabase keys are added to the GitHub repo. Nothing else changes for the family: same link,
same home-screen icon.

## A. Supabase project (10 min)
1. supabase.com → New project. Name: smiley-ranch. Region: US East. Set a database password and keep it.
2. Authentication → Sign In / Providers → **Anonymous sign-ins: ON**.
3. SQL Editor → New query → paste the whole of `supabase/all-in-one.sql` → Run. (It creates every table and the real blinds, checklist, seasons, and info labels.)
4. SQL Editor → new query:
   ```sql
   select public.bootstrap_secrets('<your family code>', '<4-digit admin PIN>');
   insert into public.members (name) values ('Dad');
   ```
   Pick a family code people can type on a phone, like `smiley-2026`.
5. Project Settings → API: copy **Project URL** and the **anon public** key.

## B. Point the app at it (2 min)
GitHub repo → Settings → Secrets and variables → Actions → New repository secret:
- `SUPABASE_URL` = the Project URL
- `SUPABASE_ANON_KEY` = the anon public key
- `VAPID_PUBLIC_KEY` = the public key from the keys file

Then Actions → Deploy to GitHub Pages → Run workflow. Two minutes later the link is live.

## C. Notifications (10 min)
1. Supabase → Edge Functions → Deploy a new function → name `push` → paste `supabase/functions/push/index.ts` → Deploy. Turn **off** "Verify JWT" for this function (Function settings).
2. Edge Functions → Secrets → add four:
   - `PUSH_SECRET` = pushSecret from the keys file
   - `VAPID_PUBLIC_KEY` = publicKey from the keys file
   - `VAPID_PRIVATE_KEY` = privateKey from the keys file
   - `VAPID_SUBJECT` = `mailto:you@yourmail.com`
3. Database → Extensions → enable **pg_net** and **pg_cron**.
4. SQL Editor:
   ```sql
   insert into private.config (key, value) values
     ('push_url', 'https://<project-ref>.supabase.co/functions/v1/push'),
     ('push_secret', '<pushSecret from the keys file>');
   ```
   The project-ref is the part of your Project URL before `.supabase.co`.

## D. First use
1. Open the link on your phone, enter the family code, pick Dad.
2. More → Unlock admin → Members: add everyone.
3. Ranch info: fill in the gate code, Wi-Fi, contacts.
4. Blinds: tap each one and set how long a bag lasts.
5. More → Notifications → allow. Then add a calendar entry and watch another phone buzz.

Keep the keys file somewhere safe (a password manager). Delete it from Messages or email after.
