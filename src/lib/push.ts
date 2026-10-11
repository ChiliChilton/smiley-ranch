import type { PushPrefs } from './database.types'
import { supabase } from './supabase'
import { pushSupported } from './standalone'

export const PREF_LABELS: { key: keyof PushPrefs; label: string; hint: string }[] = [
  { key: 'stand_claims', label: 'Stands this weekend', hint: 'Someone claimed or released a stand for the coming weekend' },
  { key: 'harvests', label: 'Harvests', hint: 'A new harvest was posted' },
  { key: 'todos_assigned', label: 'To-dos for me', hint: 'Someone assigned you a to-do' },
  { key: 'events', label: 'Calendar', hint: 'A new trip, work day, or date was added' },
  { key: 'feeders_overdue', label: 'Feeders due (daily)', hint: 'A morning digest of feeders that are due. Admin usually takes this one.' },
]

export function defaultPrefs(isAdmin: boolean): PushPrefs {
  return { stand_claims: true, harvests: true, todos_assigned: true, events: true, feeders_overdue: isAdmin }
}

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
export const pushConfigured = Boolean(VAPID)

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.ready
}

/** The browser-side subscription on this phone, if any. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  try {
    const reg = await registration()
    return await reg.pushManager.getSubscription()
  } catch {
    return null
  }
}

/** Our row for this phone's subscription (prefs live here). */
export async function loadMyPushRow() {
  const sub = await currentSubscription()
  if (!sub) return { sub: null, row: null }
  const { data } = await supabase.from('push_subscriptions').select('*').eq('endpoint', sub.endpoint).maybeSingle()
  return { sub, row: data ?? null }
}

/** Ask permission, subscribe, and save with the given preferences. */
export async function enablePush(memberId: string, prefs: PushPrefs): Promise<void> {
  if (!pushSupported()) throw new Error("This phone can't do notifications here.")
  if (!VAPID) throw new Error('Notifications are not set up yet (missing VAPID key).')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error("Notifications are blocked. Turn them on in your phone's Settings for Smiley Ranch.")
  const reg = await registration()
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID) as BufferSource }))
  const json = sub.toJSON()
  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) throw new Error('Not signed in.')
  const { error } = await supabase.from('push_subscriptions').upsert(
    { auth_user_id: userId, member_id: memberId, endpoint: sub.endpoint, p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '', prefs },
    { onConflict: 'endpoint' },
  )
  if (error) throw error
}

export async function savePrefs(endpoint: string, prefs: PushPrefs) {
  const { error } = await supabase.from('push_subscriptions').update({ prefs }).eq('endpoint', endpoint)
  if (error) throw error
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}
