import type { StandClaimRow } from './database.types'
import { addDays, parseISODate, todayISO } from './dates'
import { supabase } from './supabase'

export const SITS = ['am', 'pm'] as const
export const SIT_LABEL = { am: 'AM', pm: 'PM' } as const

/** The Saturday and Sunday people mean by "this weekend", skipping days already past. */
export function weekendDates(): string[] {
  const today = todayISO()
  const dow = parseISODate(today).getDay() // 0 = Sun
  const sat = dow === 6 ? today : dow === 0 ? addDays(today, -1) : addDays(today, 6 - dow)
  return [sat, addDays(sat, 1)].filter((d) => d >= today)
}

export async function loadClaims(from: string, to: string): Promise<StandClaimRow[]> {
  const { data, error } = await supabase
    .from('stand_claims')
    .select('*')
    .is('released_at', null)
    .gte('date', from)
    .lte('date', to)
    .order('date')
    .order('sit')
  if (error) throw error
  return data ?? []
}

export async function claimStand(standId: string, memberId: string, date: string, sit: 'am' | 'pm', note: string | null) {
  const { error } = await supabase.from('stand_claims').insert({ stand_id: standId, member_id: memberId, date, sit, note })
  if (error) {
    if (error.code === '23505') throw new Error('Someone just took that sit.')
    throw error
  }
}

export async function releaseClaim(claimId: string, memberId: string) {
  const { error } = await supabase
    .from('stand_claims')
    .update({ released_at: new Date().toISOString(), released_by: memberId })
    .eq('id', claimId)
  if (error) throw error
}
