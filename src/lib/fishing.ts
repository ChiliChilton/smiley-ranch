import type { CatchRow, PinRow, WaterLevel } from './database.types'
import { supabase } from './supabase'

export const FISH = ['Bass', 'Catfish', 'Crappie', 'Perch', 'Other'] as const
export const WATER_LEVEL: Record<WaterLevel, string> = { full: 'Full', down: 'Down some', low: 'Low' }

export async function loadWaters(): Promise<PinRow[]> {
  const { data, error } = await supabase.from('pins').select('*').eq('type', 'water').is('deleted_at', null).order('name')
  if (error) throw error
  return data ?? []
}

export async function loadCatches(limit = 500): Promise<CatchRow[]> {
  const { data, error } = await supabase.from('catches').select('*').is('deleted_at', null).order('caught_on', { ascending: false }).order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return data ?? []
}

export function catchLabel(c: CatchRow): string {
  const size = c.weight_lb != null ? `${Number(c.weight_lb)} lb ` : c.length_in != null ? `${Number(c.length_in)}" ` : ''
  return `${size}${c.species.toLowerCase()}${c.bait ? ` on ${c.bait}` : ''}${c.released ? ', released' : ''}`
}

/** Heaviest catch on this water, or the longest when nobody weighed one. */
export function bestCatch(list: CatchRow[]): CatchRow | null {
  const weighed = list.filter((c) => c.weight_lb != null).sort((a, b) => Number(b.weight_lb) - Number(a.weight_lb))
  if (weighed.length) return weighed[0]
  const measured = list.filter((c) => c.length_in != null).sort((a, b) => Number(b.length_in) - Number(a.length_in))
  return measured[0] ?? null
}
