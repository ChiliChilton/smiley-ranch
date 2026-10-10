import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useRealtime } from './realtime'

export type EmergencyInfo = {
  address: string
  directions: string
  lat: string
  lng: string
  extra: string
}

export const EMERGENCY_KEYS: Record<keyof EmergencyInfo, string> = {
  address: 'emergency_address',
  directions: 'emergency_directions',
  lat: 'emergency_lat',
  lng: 'emergency_lng',
  extra: 'emergency_extra',
}

const EMPTY: EmergencyInfo = { address: '', directions: '', lat: '', lng: '', extra: '' }

/** Non-secret settings rows as a key/value map. Hash rows are never returned by RLS. */
export function useSettings() {
  const [values, setValues] = useState<Record<string, string> | null>(null)

  const reload = useCallback(async () => {
    const { data } = await supabase.from('settings').select('key, value')
    if (data) setValues(Object.fromEntries(data.map((r) => [r.key, r.value])))
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])
  useRealtime(['settings'], reload)

  const save = useCallback(
    async (entries: Record<string, string>) => {
      const rows = Object.entries(entries).map(([key, value]) => ({ key, value }))
      const { error } = await supabase.from('settings').upsert(rows, { onConflict: 'key' })
      if (error) throw error
      await reload()
    },
    [reload],
  )

  return { values, loading: values === null, reload, save }
}

export function emergencyFrom(values: Record<string, string> | null): EmergencyInfo {
  if (!values) return EMPTY
  return {
    address: values[EMERGENCY_KEYS.address] ?? '',
    directions: values[EMERGENCY_KEYS.directions] ?? '',
    lat: values[EMERGENCY_KEYS.lat] ?? '',
    lng: values[EMERGENCY_KEYS.lng] ?? '',
    extra: values[EMERGENCY_KEYS.extra] ?? '',
  }
}

export function emergencyText(info: EmergencyInfo): string {
  const lines = ['Back 40 property']
  if (info.address) lines.push(info.address)
  if (info.lat && info.lng) lines.push(`GPS: ${info.lat}, ${info.lng}`, `https://maps.google.com/?q=${info.lat},${info.lng}`)
  if (info.directions) lines.push(info.directions)
  if (info.extra) lines.push(info.extra)
  return lines.join('\n')
}
