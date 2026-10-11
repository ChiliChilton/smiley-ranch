import type { InfoItemRow, InfoSection } from './database.types'
import { supabase } from './supabase'

export const INFO_SECTIONS: Record<InfoSection, { title: string; blurb: string }> = {
  access: { title: 'Getting in', blurb: 'Gate, doors, Wi-Fi.' },
  house: { title: 'Around the house', blurb: 'Where things are and what to do with them.' },
  utilities: { title: 'Water, power, propane', blurb: 'Septic, well, tanks.' },
  contacts: { title: 'Who to call', blurb: 'Tap a number to call it.' },
}
export const INFO_SECTION_ORDER: InfoSection[] = ['access', 'house', 'utilities', 'contacts']

export async function loadInfo(): Promise<InfoItemRow[]> {
  const { data, error } = await supabase.from('info_items').select('*').is('deleted_at', null).order('section').order('sort_order').order('created_at')
  if (error) throw error
  return data ?? []
}

/** A value that looks like a phone number becomes a tel: link. */
export function phoneIn(value: string): string | null {
  const m = value.match(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/)
  return m ? m[0].replace(/[^\d+]/g, '') : null
}
