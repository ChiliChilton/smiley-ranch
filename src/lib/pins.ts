import type { PinRow, PinType, StandType } from './database.types'
import { supabase } from './supabase'

export const PIN_TYPES: Record<PinType, { label: string; plural: string; color: string; glyph: string }> = {
  stand: { label: 'Stand', plural: 'Stands', color: '#8c3d1f', glyph: 'S' },
  feeder: { label: 'Feeder', plural: 'Feeders', color: '#c9a227', glyph: 'F' },
  camera: { label: 'Camera', plural: 'Cameras', color: '#4a5568', glyph: 'C' },
  water: { label: 'Water / tank', plural: 'Water', color: '#2b6cb0', glyph: 'W' },
  gate: { label: 'Gate', plural: 'Gates', color: '#5c3d2e', glyph: 'G' },
  food_plot: { label: 'Food plot', plural: 'Food plots', color: '#4f7f4a', glyph: 'P' },
  hazard: { label: 'Hazard', plural: 'Hazards', color: '#d32f2f', glyph: '!' },
  other: { label: 'Other', plural: 'Other', color: '#718096', glyph: '•' },
}

export const PIN_TYPE_ORDER: PinType[] = ['stand', 'feeder', 'camera', 'water', 'gate', 'food_plot', 'hazard', 'other']

/** Only the admin adds or edits blinds and feeders. */
export const ADMIN_ONLY_TYPES: PinType[] = ['stand', 'feeder', 'camera']
export const MEMBER_TYPES: PinType[] = ['hazard', 'other']

export const STAND_TYPES: Record<StandType, string> = {
  ladder: 'Ladder',
  box_blind: 'Box blind',
  ground_blind: 'Ground blind',
}

export function canEditPin(pin: PinRow, memberId: string | null, isAdmin: boolean): boolean {
  if (isAdmin) return true
  return pin.created_by === memberId && MEMBER_TYPES.includes(pin.type)
}

export async function loadPins(): Promise<PinRow[]> {
  const { data, error } = await supabase.from('pins').select('*').is('deleted_at', null).order('name')
  if (error) throw error
  return data ?? []
}
