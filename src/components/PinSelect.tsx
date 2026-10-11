import { useEffect, useState } from 'react'
import type { PinRow, PinType } from '../lib/database.types'
import { loadPins, PIN_TYPES } from '../lib/pins'
import { fmtCoords } from '../lib/pins'
import { Button } from './Button'

export type Where = { pin_id: string | null; lat: number | null; lng: number | null }

/** "Where was it?" A pin from the map, or the phone's GPS. */
export function PinSelect({ value, onChange, types }: { value: Where; onChange: (w: Where) => void; types?: PinType[] }) {
  const [pins, setPins] = useState<PinRow[]>([])
  const [locating, setLocating] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    loadPins().then((all) => setPins(types ? all.filter((p) => types.includes(p.type)) : all)).catch(() => {})
  }, [types])

  function useGps() {
    if (!navigator.geolocation) return setErr("This phone can't share its location.")
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocating(false); onChange({ pin_id: null, lat: Number(pos.coords.latitude.toFixed(5)), lng: Number(pos.coords.longitude.toFixed(5)) }) },
      () => { setLocating(false); setErr("Couldn't get your location.") },
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  return (
    <div>
      <label htmlFor="whereSelect" className="mb-1 block text-sm font-semibold text-clay-900">Where</label>
      <div className="flex gap-2">
        <select
          id="whereSelect"
          value={value.pin_id ?? (value.lat != null ? '__gps' : '')}
          onChange={(e) => {
            const v = e.target.value
            if (v === '__gps') return
            onChange({ pin_id: v || null, lat: null, lng: null })
          }}
          className="tap min-w-0 flex-1 rounded-md border border-tan-500 bg-white px-3 py-2.5 text-ink"
        >
          <option value="">Not sure / not on the map</option>
          {value.lat != null && <option value="__gps">My location ({fmtCoords(value.lat, value.lng!)})</option>}
          {pins.map((p) => (
            <option key={p.id} value={p.id}>{p.name} · {PIN_TYPES[p.type].label}</option>
          ))}
        </select>
        <Button variant="secondary" busy={locating} onClick={useGps} className="shrink-0 !px-3">GPS</Button>
      </div>
      {err && <p className="mt-1 text-sm text-alert">{err}</p>}
    </div>
  )
}
