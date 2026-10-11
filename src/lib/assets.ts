import type { AssetKind, AssetRow, AssetStatus } from './database.types'
import { supabase } from './supabase'

export const ASSET_KINDS: Record<AssetKind, string> = {
  building: 'Building',
  vehicle: 'Truck / vehicle',
  atv: 'ATV / UTV',
  tractor: 'Tractor',
  trailer: 'Trailer',
  other: 'Other',
}
export const ASSET_KIND_ORDER: AssetKind[] = ['building', 'vehicle', 'atv', 'tractor', 'trailer', 'other']

export const ASSET_STATUS: Record<AssetStatus, { label: string; dot: string; chip: string }> = {
  good: { label: 'Good', dot: 'bg-ok', chip: 'bg-sage-100 text-sage-900' },
  attention: { label: 'Needs attention', dot: 'bg-warn', chip: 'bg-warn/20 text-tan-700' },
  down: { label: 'Down', dot: 'bg-alert', chip: 'bg-alert/10 text-alert' },
}
export const ASSET_STATUS_ORDER: AssetStatus[] = ['good', 'attention', 'down']

export async function loadAssets(): Promise<AssetRow[]> {
  const { data, error } = await supabase.from('assets').select('*').is('deleted_at', null).order('sort_order').order('name')
  if (error) throw error
  return data ?? []
}

export const assetName = (assets: AssetRow[], id: string | null | undefined) => (id ? assets.find((a) => a.id === id)?.name ?? null : null)
