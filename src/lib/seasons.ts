import type { SeasonRow, SeasonSpecies } from './database.types'
import { addDays, daysBetween, fmtDate, todayISO } from './dates'
import { supabase } from './supabase'

export const SPECIES: Record<SeasonSpecies, { label: string; bar: string; chip: string }> = {
  deer: { label: 'Deer', bar: 'bg-clay-950', chip: 'bg-clay-950 text-cream' },
  turkey: { label: 'Turkey', bar: 'bg-sage-900', chip: 'bg-sage-900 text-cream' },
  dove: { label: 'Dove', bar: 'bg-amber-600', chip: 'bg-amber-600 text-white' },
  quail: { label: 'Quail', bar: 'bg-stone-500', chip: 'bg-stone-500 text-white' },
  other: { label: 'Other', bar: 'bg-tan-600', chip: 'bg-tan-600 text-cream' },
}
export const SPECIES_ORDER: SeasonSpecies[] = ['deer', 'turkey', 'dove', 'quail', 'other']

export async function loadSeasons(): Promise<SeasonRow[]> {
  const { data, error } = await supabase.from('seasons').select('*').is('deleted_at', null).order('starts_on').order('species')
  if (error) throw error
  return data ?? []
}

export function seasonLabel(s: Pick<SeasonRow, 'name' | 'species'>): string {
  return `${SPECIES[s.species].label} · ${s.name}`
}

export function openOn(seasons: SeasonRow[], iso: string): SeasonRow[] {
  return seasons.filter((s) => s.starts_on <= iso && iso <= s.ends_on)
}

/** What's open today and what opens next (everything sharing the soonest start date). */
export function seasonStatus(seasons: SeasonRow[], today = todayISO()) {
  const open = openOn(seasons, today).sort((a, b) => a.ends_on.localeCompare(b.ends_on))
  const upcoming = seasons.filter((s) => s.starts_on > today).sort((a, b) => a.starts_on.localeCompare(b.starts_on))
  const next = upcoming.length ? upcoming.filter((s) => s.starts_on === upcoming[0].starts_on) : []
  return { open, next, inDays: next.length ? daysBetween(today, next[0].starts_on) : null }
}

/** "through Nov 6" / "ends today" / "ends tomorrow" */
export function endsText(s: SeasonRow, today = todayISO()): string {
  if (s.ends_on === today) return 'ends today'
  if (s.ends_on === addDays(today, 1)) return 'ends tomorrow'
  return `through ${fmtDate(s.ends_on, { weekday: false })}`
}
