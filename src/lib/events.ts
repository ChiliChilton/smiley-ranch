import type { EventKind, EventRow } from './database.types'
import { supabase } from './supabase'

export const KIND: Record<EventKind, { label: string; bar: string; badge: string; help: string }> = {
  inclusive: {
    label: 'Come join',
    bar: 'bg-pine-600',
    badge: 'bg-pine-100 text-pine-900',
    help: 'Anyone can come. Tap "I\'m in" to say you\'re going.',
  },
  exclusive: {
    label: 'Just them',
    bar: 'bg-tan-700',
    badge: 'bg-tan-200 text-tan-700',
    help: 'They have the place to themselves these dates.',
  },
  info: {
    label: 'Note',
    bar: 'border border-tan-600 bg-transparent',
    badge: 'bg-cream-dark text-ink-muted',
    help: 'Just a date to know about.',
  },
}

export const KIND_ORDER: EventKind[] = ['inclusive', 'exclusive', 'info']

/** Live events whose range ends on or after `fromISO`. */
export async function loadEvents(fromISO: string): Promise<EventRow[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .is('deleted_at', null)
    .gte('ends_on', fromISO)
    .order('starts_on')
    .order('ends_on')
  if (error) throw error
  return data ?? []
}

/** Live exclusive stays overlapping a range, for the "someone else has these dates" warning. */
export async function exclusiveOverlapping(start: string, end: string, excludeId?: string): Promise<EventRow[]> {
  let q = supabase
    .from('events')
    .select('*')
    .is('deleted_at', null)
    .eq('kind', 'exclusive')
    .lte('starts_on', end)
    .gte('ends_on', start)
  if (excludeId) q = q.neq('id', excludeId)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}
