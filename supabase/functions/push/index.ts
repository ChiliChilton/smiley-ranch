// Back 40 push fan-out. Called by Postgres (notify_push) with a shared secret.
//
// Deploy:   supabase functions deploy push --no-verify-jwt
// Secrets:  supabase secrets set PUSH_SECRET=... VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

type Payload = { kind: string; title: string; body: string; url?: string; only?: string[] | null; exclude?: string | null }

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 })
  const secret = Deno.env.get('PUSH_SECRET')
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return new Response('Unauthorized', { status: 401 })

  const p = (await req.json()) as Payload
  if (!p.kind || !p.title) return new Response('Bad payload', { status: 400 })

  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com', Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: subs, error } = await sb.from('push_subscriptions').select('id, member_id, endpoint, p256dh, auth, prefs')
  if (error) return new Response(error.message, { status: 500 })

  const targets = (subs ?? []).filter((s) => {
    if (p.only && !p.only.includes(s.member_id)) return false
    if (p.exclude && s.member_id === p.exclude) return false
    return (s.prefs as Record<string, boolean> | null)?.[p.kind] === true
  })

  const message = JSON.stringify({ title: p.title, body: p.body, url: p.url ?? '/' })
  let sent = 0
  const gone: string[] = []
  await Promise.all(
    targets.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, message, { TTL: 60 * 60 * 6 })
        sent++
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) gone.push(s.id) // phone unsubscribed or reinstalled
        else console.error('push failed', s.id, code, (err as Error).message)
      }
    }),
  )
  if (gone.length) await sb.from('push_subscriptions').delete().in('id', gone)

  return new Response(JSON.stringify({ kind: p.kind, targets: targets.length, sent, removed: gone.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
