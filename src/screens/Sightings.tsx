import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button, Spinner } from '../components/Button'
import { Card } from '../components/Card'
import { TextInput } from '../components/Input'
import { Note } from '../components/Note'
import { PhotoStrip } from '../components/Photos'
import { Screen } from '../components/Screen'
import { Sheet } from '../components/Sheet'
import type { PhotoRow, PinRow, SightingRow } from '../lib/database.types'
import { fmtDateTime } from '../lib/dates'
import { friendlyError } from '../lib/errors'
import { useMembers } from '../lib/members'
import { fmtCoords, loadPins } from '../lib/pins'
import { loadPhotosFor, removePhoto } from '../lib/photos'
import { useRealtime } from '../lib/realtime'
import { useMe } from '../lib/session'
import { supabase } from '../lib/supabase'

export function Sightings() {
  const navigate = useNavigate()
  const me = useMe()
  const { nameOf } = useMembers()
  const [rows, setRows] = useState<SightingRow[] | null>(null)
  const [photos, setPhotos] = useState<Map<string, PhotoRow[]>>(new Map())
  const [pins, setPins] = useState<PinRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [species, setSpecies] = useState('')
  const [pinId, setPinId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [open, setOpen] = useState<SightingRow | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const reload = useCallback(async () => {
    try {
      let q = supabase.from('sightings').select('*').is('deleted_at', null).order('seen_at', { ascending: false }).limit(200)
      if (species) q = q.eq('species', species)
      if (pinId) q = q.eq('pin_id', pinId)
      if (from) q = q.gte('seen_at', `${from}T00:00:00`)
      if (to) q = q.lte('seen_at', `${to}T23:59:59`)
      const [{ data, error }, allPins] = await Promise.all([q, loadPins()])
      if (error) throw error
      setRows(data ?? [])
      setPins(allPins)
      setPhotos(await loadPhotosFor('sighting', (data ?? []).map((r) => r.id)))
    } catch (err) {
      setError(friendlyError(err))
    }
  }, [species, pinId, from, to])
  useEffect(() => { void reload() }, [reload])
  useRealtime(['sightings', 'photos'], reload)

  const speciesSeen = useMemo(() => Array.from(new Set((rows ?? []).map((r) => r.species))).sort(), [rows])
  const pinName = (id: string | null) => pins.find((p) => p.id === id)?.name
  const filtered = Boolean(species || pinId || from || to)

  async function remove(row: SightingRow) {
    const { error } = await supabase.from('sightings').update({ deleted_at: new Date().toISOString() }).eq('id', row.id)
    if (error) return setError(friendlyError(error))
    setOpen(null)
    await reload()
  }

  return (
    <Screen
      title="Sightings"
      back="/more"
      right={
        <button type="button" onClick={() => navigate('/sightings/new')} className="tap flex items-center gap-1 rounded-lg px-3 font-semibold active:bg-clay-800">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
          Add
        </button>
      }
    >
      {error && <Note kind="error" className="mb-3">{error}</Note>}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant={filtered ? 'primary' : 'secondary'} className="!py-2 text-sm" onClick={() => setFiltersOpen(true)}>
          {filtered ? 'Filters on' : 'Filter'}
        </Button>
        {filtered && <Button variant="ghost" className="!py-2 text-sm" onClick={() => { setSpecies(''); setPinId(''); setFrom(''); setTo('') }}>Clear</Button>}
        {speciesSeen.slice(0, 4).map((sp) => (
          <button key={sp} type="button" onClick={() => setSpecies(species === sp ? '' : sp)} className={`tap rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${species === sp ? 'bg-clay-900 text-cream ring-clay-900' : 'bg-white text-clay-950 ring-tan-500'}`}>
            {sp}
          </button>
        ))}
      </div>

      {!rows ? (
        <div className="flex justify-center py-8 text-clay-900"><Spinner /></div>
      ) : rows.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-muted">{filtered ? 'Nothing matches those filters.' : 'No sightings yet. Saw something? Add it.'}</p>
          <div className="mt-3"><Button variant="secondary" onClick={() => navigate('/sightings/new')}>Add a sighting</Button></div>
        </Card>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setOpen(r)} className="tap w-full rounded-2xl bg-white p-4 text-left ring-1 ring-tan-200 active:bg-tan-100">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-clay-950">{r.count > 1 ? `${r.count} ${r.species}` : r.species}</span>
                  {r.description && <span className="truncate text-ink">· {r.description}</span>}
                </div>
                <div className="text-sm text-ink-muted">
                  {fmtDateTime(r.seen_at)} · {pinName(r.pin_id) ?? (r.lat != null ? 'GPS spot' : 'somewhere')} · {nameOf(r.created_by)}
                  {(photos.get(r.id)?.length ?? 0) > 0 && ` · ${photos.get(r.id)!.length} photo${photos.get(r.id)!.length > 1 ? 's' : ''}`}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filter sightings">
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-clay-900">Species</span>
            <select value={species} onChange={(e) => setSpecies(e.target.value)} className="tap w-full rounded-xl border border-tan-500 bg-white px-3 py-3">
              <option value="">Any</option>
              {speciesSeen.map((sp) => <option key={sp} value={sp}>{sp}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-clay-900">Stand or spot</span>
            <select value={pinId} onChange={(e) => setPinId(e.target.value)} className="tap w-full rounded-xl border border-tan-500 bg-white px-3 py-3">
              <option value="">Anywhere</option>
              {pins.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <TextInput label="From" name="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <TextInput label="To" name="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button full onClick={() => setFiltersOpen(false)}>Done</Button>
        </div>
      </Sheet>

      <Sheet open={open !== null} onClose={() => setOpen(null)} title={open ? (open.count > 1 ? `${open.count} ${open.species}` : open.species) : ''}>
        {open && (
          <div className="space-y-3">
            {open.description && <p className="text-lg font-bold text-clay-950">{open.description}</p>}
            <p className="text-sm text-ink">
              {fmtDateTime(open.seen_at)}<br />
              {pinName(open.pin_id) ?? (open.lat != null ? fmtCoords(open.lat, open.lng!) : 'Location not given')}<br />
              Seen by {nameOf(open.created_by)}
            </p>
            {open.notes && <p className="whitespace-pre-wrap text-ink">{open.notes}</p>}
            <PhotoStrip photos={photos.get(open.id) ?? []} size="md" onRemove={(open.created_by === me.member_id || me.is_admin) ? async (p) => { await removePhoto(p); await reload() } : undefined} />
            {(open.created_by === me.member_id || me.is_admin) && (
              <div className="flex gap-2 pt-1">
                <Button variant="secondary" onClick={() => navigate(`/sightings/${open.id}/edit`)}>Edit</Button>
                <Button variant="ghost" onClick={() => remove(open)}>Remove</Button>
              </div>
            )}
          </div>
        )}
      </Sheet>
    </Screen>
  )
}
