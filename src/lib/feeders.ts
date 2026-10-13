import type { FeederFillRow, PinRow } from './database.types'
import { addDays, daysBetween, toISODate, todayISO } from './dates'
import { supabase } from './supabase'
import { createRow, patchRow } from './outbox'

export type FeederStatus = 'fresh' | 'due' | 'overdue' | 'unknown'

const GRACE_DAYS = 3        // interval mode: red this many days after it was due
const WARN_DAYS = 2         // bag mode: yellow this many days before it's expected to run out

export function daysSince(ts: string): number {
  return Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)
}

export type FeederEstimate = {
  status: FeederStatus
  days: number | null          // days since the last fill
  runsOut: string | null       // ISO date the corn is expected to run out (bag mode only)
  daysLeft: number | null      // negative when already past
  mode: 'bags' | 'interval' | 'none'
}

/**
 * Bag mode: last fill had N bags and the feeder says a bag lasts D days -> runs out N*D days after the fill.
 * Interval mode (fallback): fixed days between fills. Green until due, yellow when due / close, red when past.
 */
export function feederStatus(feeder: PinRow, lastFill: FeederFillRow | undefined): FeederEstimate {
  if (!lastFill) return { status: 'unknown', days: null, runsOut: null, daysLeft: null, mode: 'none' }
  const days = daysSince(lastFill.filled_at)
  if (lastFill.bags != null && feeder.days_per_bag) {
    const lasts = Math.round(Number(lastFill.bags) * Number(feeder.days_per_bag))
    const runsOut = addDays(toISODate(new Date(lastFill.filled_at)), lasts)
    const daysLeft = daysBetween(todayISO(), runsOut)
    const status: FeederStatus = daysLeft < 0 ? 'overdue' : daysLeft <= WARN_DAYS ? 'due' : 'fresh'
    return { status, days, runsOut, daysLeft, mode: 'bags' }
  }
  const n = feeder.fill_interval_days
  if (!n) return { status: 'fresh', days, runsOut: null, daysLeft: null, mode: 'none' }
  const status: FeederStatus = days >= n + GRACE_DAYS ? 'overdue' : days >= n ? 'due' : 'fresh'
  return { status, days, runsOut: null, daysLeft: n - days, mode: 'interval' }
}

export const STATUS_STYLE: Record<FeederStatus, { dot: string; label: string; chip: string }> = {
  fresh: { dot: 'bg-ok', label: 'Good', chip: 'bg-sage-100 text-sage-900' },
  due: { dot: 'bg-warn', label: 'Running low', chip: 'bg-warn/20 text-tan-700' },
  overdue: { dot: 'bg-alert', label: 'Empty', chip: 'bg-alert/10 text-alert' },
  unknown: { dot: 'bg-tan-500', label: 'Never filled', chip: 'bg-cream-dark text-ink-muted' },
}

export const hasFeeder = (p: PinRow) => p.type === 'feeder' || p.has_feeder

/** Everything with a feeder (standalone feeders and blinds that have one) plus the latest fill for each. */
export async function loadFeeders(): Promise<{ feeders: PinRow[]; spots: PinRow[]; lastFill: Map<string, FeederFillRow> }> {
  const [{ data: allPins, error: e1 }, { data: fills, error: e2 }] = await Promise.all([
    supabase.from('pins').select('*').is('deleted_at', null).order('name'),
    supabase.from('feeder_fills').select('*').is('deleted_at', null).order('filled_at', { ascending: false }).limit(500),
  ])
  if (e1) throw e1
  if (e2) throw e2
  const lastFill = new Map<string, FeederFillRow>()
  for (const f of fills ?? []) if (!lastFill.has(f.feeder_id)) lastFill.set(f.feeder_id, f)
  const spots = (allPins ?? []).filter((p) => p.type === 'stand' || p.type === 'feeder')
  return { feeders: spots.filter(hasFeeder), spots, lastFill }
}

export async function recordFill(feederId: string, details?: { bags?: number | null; amount?: string | null; feed_type?: string | null }): Promise<FeederFillRow & { queued: boolean }> {
  const now = new Date().toISOString()
  const { row, queued } = await createRow('feeder_fills', { feeder_id: feederId, filled_at: now, bags: details?.bags ?? null, amount: details?.amount ?? null, feed_type: details?.feed_type ?? null })
  return { ...row, created_by: null, created_at: now, deleted_at: null, queued }
}

export async function updateFill(fillId: string, patch: { bags: number | null; feed_type: string | null }) {
  await patchRow('feeder_fills', fillId, patch)
}

const LAST_FEED_KEY = 'back40.lastFeedType'
export function rememberFeedType(t: string | null) {
  try { if (t) localStorage.setItem(LAST_FEED_KEY, t) } catch { /* ignore */ }
}
export function lastFeedType(): string {
  try { return localStorage.getItem(LAST_FEED_KEY) ?? '' } catch { return '' }
}
