import { useEffect, useState } from 'react'
import type { AssetRow } from '../lib/database.types'
import { loadAssets } from '../lib/assets'

/** Chips for "which place or machine is this for". Loads the list itself unless given one. */
export function AssetPicker({ value, onChange, assets: given, allowAny, small, label }: {
  value: string | null | 'any'
  onChange: (id: string | null | 'any') => void
  assets?: AssetRow[]
  allowAny?: boolean
  small?: boolean
  label?: string
}) {
  const [loaded, setLoaded] = useState<AssetRow[]>(given ?? [])
  useEffect(() => { if (!given) loadAssets().then(setLoaded).catch(() => {}) }, [given])
  const assets = given ?? loaded
  const opts: { value: string | null | 'any'; label: string }[] = [
    ...(allowAny ? [{ value: 'any' as const, label: 'All' }] : []),
    ...assets.map((a) => ({ value: a.id, label: a.name })),
    ...(allowAny ? [] : [{ value: null, label: 'Other' }]),
  ]
  return (
    <div>
      {label && <span className="mb-1 block text-sm font-semibold text-clay-900">{label}</span>}
      <div className={`flex gap-1.5 ${small ? '-mx-4 overflow-x-auto px-4 pb-1' : 'flex-wrap'}`}>
        {opts.map((o) => (
          <button key={String(o.value)} type="button" onClick={() => onChange(o.value)} aria-pressed={value === o.value} className={`tap shrink-0 rounded-md font-bold ring-1 ${small ? '!min-h-0 px-3 py-1.5 text-xs' : 'px-3 py-2 text-sm'} ${value === o.value ? 'bg-clay-900 text-cream ring-clay-900' : 'bg-white text-clay-950 ring-tan-500'}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function AssetTag({ name }: { name: string | null | undefined }) {
  if (!name) return null
  return <span className="ml-2 rounded bg-tan-200 px-1.5 py-0.5 align-middle text-[10px] font-extrabold uppercase tracking-wide text-tan-700">{name}</span>
}
