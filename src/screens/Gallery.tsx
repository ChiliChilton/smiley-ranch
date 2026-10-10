import { useCallback, useEffect, useMemo, useState } from 'react'
import { Spinner } from '../components/Button'
import { Note } from '../components/Note'
import { Screen } from '../components/Screen'
import { Sheet } from '../components/Sheet'
import type { PhotoParent, PhotoRow, PinRow } from '../lib/database.types'
import { fmtDateTime } from '../lib/dates'
import { friendlyError } from '../lib/errors'
import { useMembers } from '../lib/members'
import { loadPins } from '../lib/pins'
import { photoUrls } from '../lib/photos'
import { useRealtime } from '../lib/realtime'
import { supabase } from '../lib/supabase'

const TYPE_LABEL: Record<PhotoParent, string> = { sighting: 'Sightings', harvest: 'Harvests', log_entry: 'Log', todo: 'To-dos', pin: 'Pins', event: 'Calendar' }

export function Gallery() {
  const { nameOf } = useMembers()
  const [photos, setPhotos] = useState<PhotoRow[] | null>(null)
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  const [pins, setPins] = useState<PinRow[]>([])
  const [type, setType] = useState<PhotoParent | ''>('')
  const [pinId, setPinId] = useState('')
  const [open, setOpen] = useState<PhotoRow | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const [{ data, error }, allPins] = await Promise.all([
        supabase.from('photos').select('*').is('deleted_at', null).order('created_at', { ascending: false }).limit(300),
        loadPins(),
      ])
      if (error) throw error
      setPhotos(data ?? [])
      setPins(allPins)
      setUrls(await photoUrls((data ?? []).map((p) => p.storage_path)))
    } catch (err) {
      setError(friendlyError(err))
    }
  }, [])
  useEffect(() => { void reload() }, [reload])
  useRealtime(['photos'], reload)

  const shown = useMemo(() => (photos ?? []).filter((p) => (!type || p.parent_type === type) && (!pinId || p.pin_id === pinId)), [photos, type, pinId])
  const types = useMemo(() => Array.from(new Set((photos ?? []).map((p) => p.parent_type))), [photos])
  const pinsWithPhotos = useMemo(() => pins.filter((p) => (photos ?? []).some((ph) => ph.pin_id === p.id)), [pins, photos])

  return (
    <Screen title="Photos" back="/more">
      {error && <Note kind="error" className="mb-3">{error}</Note>}
      <div className="mb-3 flex flex-wrap gap-2">
        <select value={type} onChange={(e) => setType(e.target.value as PhotoParent | '')} className="tap rounded-xl border border-tan-500 bg-white px-3 py-2 text-sm">
          <option value="">All kinds</option>
          {types.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
        <select value={pinId} onChange={(e) => setPinId(e.target.value)} className="tap rounded-xl border border-tan-500 bg-white px-3 py-2 text-sm">
          <option value="">Anywhere</option>
          {pinsWithPhotos.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      {!photos ? (
        <div className="flex justify-center py-8 text-clay-900"><Spinner /></div>
      ) : shown.length === 0 ? (
        <Note>No photos yet. Add some to a sighting or harvest.</Note>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {shown.map((p) => (
            <button key={p.id} type="button" onClick={() => setOpen(p)} className="aspect-square overflow-hidden rounded-lg bg-tan-100 ring-1 ring-tan-200" aria-label="View photo">
              {urls.get(p.storage_path) ? <img src={urls.get(p.storage_path)} alt={p.caption ?? ''} className="h-full w-full object-cover" loading="lazy" /> : null}
            </button>
          ))}
        </div>
      )}
      <Sheet open={open !== null} onClose={() => setOpen(null)} title={open ? TYPE_LABEL[open.parent_type].replace(/s$/, '') : ''}>
        {open && (
          <div className="space-y-2">
            <img src={urls.get(open.storage_path)} alt={open.caption ?? ''} className="max-h-[60dvh] w-full rounded-xl object-contain" />
            <p className="text-sm text-ink-muted">
              {fmtDateTime(open.created_at)} · {nameOf(open.created_by)}{open.pin_id ? ` · ${pins.find((p) => p.id === open.pin_id)?.name ?? ''}` : ''}
            </p>
          </div>
        )}
      </Sheet>
    </Screen>
  )
}
