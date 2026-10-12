import { useEffect, useState } from 'react'
import type { PinRow, PinType } from '../lib/database.types'
import { loadPins, PIN_TYPES } from '../lib/pins'

export type Where = { pin_id: string | null; lat: number | null; lng: number | null }

/** "Where was it?" A blind or feeder from the list. */
export function PinSelect({ value, onChange, types }: { value: Where; onChange: (w: Where) => void; types?: PinType[] }) {
  const [pins, setPins] = useState<PinRow[]>([])
  useEffect(() => {
    loadPins().then((all) => setPins(types ? all.filter((p) => types.includes(p.type)) : all)).catch(() => {})
  }, [types])
  return (
    <div>
      <label htmlFor="whereSelect" className="mb-1 block text-sm font-semibold text-clay-900">Where</label>
      <select
        id="whereSelect"
        value={value.pin_id ?? ''}
        onChange={(e) => onChange({ pin_id: e.target.value || null, lat: null, lng: null })}
        className="tap w-full rounded-md border border-tan-500 bg-white px-3 py-2.5 text-ink"
      >
        <option value="">Not sure / somewhere else</option>
        {pins.map((p) => (
          <option key={p.id} value={p.id}>{p.name} · {PIN_TYPES[p.type].label}</option>
        ))}
      </select>
    </div>
  )
}
