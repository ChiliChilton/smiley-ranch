import type { FeederFillRow, PinRow } from './database.types'
import { supabase } from './supabase'

export type FeederStatus = 'fresh' | 'due' | 'overdue' | 'unknown'

const GRACE_DAYS = 3

export function daysSince(ts: string): number {
  return Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)
}

/** Green until the interval, yellow once it's due, red after a short grace. */
export function feederStatus(feeder: PinRow, lastFill: FeederFillRow | undefined): { status: FeederStatus; days: number | null } {
  if (!lastFill) return { status: 'unknown', days: null }
  const days = daysSince(lastFill.filled_at)
  const n = feeder.fill_interval_days
  if (!n) return { status: 'fresh', days }
  if (days >= n + GRACE_DAYS) return { status: 'overdue', days }
  if (days >= n) return { status: 'due', days }
  return { status: 'fresh', days }
}

export const STATUS_STYLE: Record<FeederStatus, { dot: string; label: string; chip: string }> = {
  fresh: { dot: 'bg-ok', label: 'Good', chip: 'bg-sage-100 text-sage-900' },
  due: { dot: 'bg-warn', label: 'Due', chip: 'bg-warn/20 text-tan-700' },
  overdue: { dot: 'bg-alert', label: 'Overdue', chip: 'bg-alert/10 text-alert' },
  unknown: { dot: 'bg-tan-500', label: 'Never filled', chip: 'bg-cream-dark text-ink-muted' },
}

/** All feeders plus the latest fill for each. */
export async function loadFeeders(): Promise<{ feeders: PinRow[]; lastFill: Map<string, FeederFillRow> }> {
  const [{ data: feeders, error: e1 }, { data: fills, error: e2 }] = await Promise.all([
    supabase.from('pins').select('*').eq('type', 'feeder').is('deleted_at', null).order('name'),
    supabase.from('feeder_fills').select('*').is('deleted_at', null).order('filled_at', { ascending: false }).limit(500),
  ])
  if (e1) throw e1
  if (e2) throw e2
  const lastFill = new Map<string, FeederFillRow>()
  for (const f of fills ?? []) if (!lastFill.has(f.feeder_id)) lastFill.set(f.feeder_id, f)
  return { feeders: feeders ?? [], lastFill }
}

export async function recordFill(feederId: string, details?: { amount?: string | null; feed_type?: string | null }): Promise<FeederFillRow> {
  const { data, error } = await supabase
    .from('feeder_fills')
    .insert({ feeder_id: feederId, amount: details?.amount ?? null, feed_type: details?.feed_type ?? null })
    .select('*')
    .single()
  if (error) throw error
  return data
}

const LAST_FEED_KEY = 'back40.lastFeedType'
export function rememberFeedType(t: string | null) {
  try { if (t) localStorage.setItem(LAST_FEED_KEY, t) } catch { /* ignore */ }
}
export function lastFeedType(): string {
  try { return localStorage.getItem(LAST_FEED_KEY) ?? '' } catch { return '' }
}
