import type { CheckinRow } from './database.types'
import { supabase } from './supabase'

export async function loadOpenCheckins(): Promise<CheckinRow[]> {
  const { data, error } = await supabase.from('checkins').select('*').is('left_at', null).order('arrived_at')
  if (error) throw error
  return data ?? []
}

export async function checkIn(memberId: string, expectedBack: string | null, note: string | null) {
  const { error } = await supabase.from('checkins').insert({ member_id: memberId, expected_back: expectedBack, note })
  if (error) throw error
}

/** Close every open check-in for this member (used by "I'm out" and by the before-you-leave list). */
export async function checkOut(memberId: string, byMemberId: string) {
  const { error } = await supabase
    .from('checkins')
    .update({ left_at: new Date().toISOString(), left_by: byMemberId })
    .eq('member_id', memberId)
    .is('left_at', null)
  if (error) throw error
}

export function isOverdue(c: CheckinRow): boolean {
  return Boolean(c.expected_back && new Date(c.expected_back).getTime() < Date.now())
}
