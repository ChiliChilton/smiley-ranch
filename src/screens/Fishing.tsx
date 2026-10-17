import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Button, Spinner } from '../components/Button'
import { TextArea, TextInput } from '../components/Input'
import { Note } from '../components/Note'
import { Photo, PhotoField } from '../components/PhotoField'
import { Screen } from '../components/Screen'
import { Sheet } from '../components/Sheet'
import type { CatchRow, PinRow, Valve, WaterLevel } from '../lib/database.types'
import { fmtDate, fmtDateTime, todayISO } from '../lib/dates'
import { friendlyError } from '../lib/errors'
import { bestCatch, catchLabel, FISH, loadCatches, loadWaters, WATER_LEVEL } from '../lib/fishing'
import { useMembers } from '../lib/members'
import { removePhoto, uploadPhoto } from '../lib/photos'
import { useRealtime } from '../lib/realtime'
import { useMe } from '../lib/session'
import { supabase } from '../lib/supabase'

const chip = (on: boolean) => `tap rounded-md px-3 py-2 text-sm font-bold ring-1 ${on ? 'bg-clay-900 text-cream ring-clay-900' : 'bg-white text-clay-950 ring-tan-500'}`

/** The waters: level and condition (upkeep), the catch log, and the best fish out of each. */
export function Fishing() {
  const me = useMe()
  const { nameOf } = useMembers()
  const [waters, setWaters] = useState<PinRow[] | null>(null)
  const [catches, setCatches] = useState<CatchRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState<PinRow | 'any' | null>(null)
  const [status, setStatus] = useState<PinRow | null>(null)
  const [log, setLog] = useState<PinRow | null>(null)
  const [open, setOpen] = useState<CatchRow | null>(null)
  const [editingWater, setEditingWater] = useState<PinRow | 'new' | null>(null)
  const year = Number(todayISO().slice(0, 4))

  const reload = useCallback(async () => {
    try {
      const [w, c] = await Promise.all([loadWaters(), loadCatches()])
      setWaters(w); setCatches(c)
      setStatus((cur) => (cur ? (w.find((x) => x.id === cur.id) ?? null) : null))
    } catch (err) {
      setError(friendlyError(err))
    }
  }, [])
  useEffect(() => { void reload() }, [reload])
  useRealtime(['pins', 'catches'], reload)

  const at = (id: string) => catches.filter((c) => c.pin_id === id)

  async function remove(c: CatchRow) {
    const { error } = await supabase.from('catches').update({ deleted_at: new Date().toISOString() }).eq('id', c.id)
    if (error) return setError(friendlyError(error))
    if (c.photo_path) void removePhoto(c.photo_path)
    setOpen(null); await reload()
  }

  return (
    <Screen title="Fishing" back="/" right={<button type="button" onClick={() => setAdding('any')} className="tap rounded-lg px-3 font-semibold active:bg-clay-800">+ Catch</button>}>
      {error && <Note kind="error" className="mb-3">{error}</Note>}
      {!waters ? (
        <div className="flex justify-center py-8 text-clay-900"><Spinner /></div>
      ) : (
        <ul className="space-y-3">
          {waters.map((w) => {
            const list = at(w.id)
            const thisYear = list.filter((c) => c.caught_on.startsWith(String(year)))
            const best = bestCatch(list)
            const bad = w.water_level === 'low' || Boolean(w.condition)
            return (
              <li key={w.id} className="rounded-2xl bg-white p-3 ring-1 ring-tan-200">
                <button type="button" onClick={() => setEditingWater(w)} className="tap block w-full py-0.5 text-left">
                  <span className="block font-bold text-clay-950">{w.name}</span>
                  <span className="block text-xs text-ink-muted">{w.acres ? `About ${Number(w.acres)} acre${Number(w.acres) === 1 ? '' : 's'}` : 'Water'}{w.notes ? ` · ${w.notes}` : ''}</span>
                </button>
                <button type="button" onClick={() => setStatus(w)} aria-label={`${w.name} status`} className="tap mt-2 block w-full border-t border-tan-200 pt-2 text-left">
                  <span className={`text-sm ${bad ? 'font-semibold text-alert' : 'text-ink'}`}>Water {WATER_LEVEL[w.water_level].toLowerCase()}{w.condition ? ` · ${w.condition}` : ''}</span>
                  {w.has_well && (
                    <span className="block text-sm text-ink">
                      <span className="font-semibold text-clay-950">Well {w.well_on ? 'running' : 'off'}</span>
                      {(w.valves ?? []).map((v) => <span key={v.name}> · {v.name} {v.open ? 'open' : 'closed'}</span>)}
                    </span>
                  )}
                  {w.photo_path && <Photo path={w.photo_path} className="mt-1 h-20 w-20" />}
                  <span className="block text-xs text-ink-muted">{w.status_at ? `${nameOf(w.status_by)}, ${fmtDateTime(w.status_at)}` : 'Nobody has checked it yet'} · tap to update</span>
                </button>
                <button type="button" onClick={() => setLog(w)} className="tap mt-2 block w-full border-t border-tan-200 pt-2 text-left text-sm">
                  {list.length === 0 ? (
                    <span className="text-ink-muted">No catches logged yet.</span>
                  ) : (
                    <>
                      <span className="text-ink"><span className="font-semibold text-clay-950">{thisYear.length}</span> this year, {list.length} all time.</span>
                      {best && <span className="block text-ink"><span className="font-semibold text-clay-950">Best:</span> {nameOf(best.member_id).split(' ')[0]}, {catchLabel(best)}, {fmtDate(best.caught_on, { weekday: false })}</span>}
                      <span className="block text-xs text-ink-muted">Last: {nameOf(list[0].member_id).split(' ')[0]}, {catchLabel(list[0])}, {fmtDate(list[0].caught_on, { weekday: false })} · tap for the log</span>
                    </>
                  )}
                </button>
                <div className="mt-2 flex flex-wrap gap-x-4 text-xs font-semibold text-clay-800">
                  <button type="button" className="underline" onClick={() => setAdding(w)}>+ Catch here</button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 text-xs text-ink-muted">
        <span>Tap a name to edit the water, the status line to say how it's doing.</span>
        <button type="button" className="font-semibold text-clay-800 underline" onClick={() => setEditingWater('new')}>+ Add a water</button>
      </div>

      <Sheet open={adding !== null} onClose={() => setAdding(null)} title="Log a catch">
        {adding && waters && <CatchForm waters={waters} water={adding === 'any' ? null : adding} onDone={async () => { setAdding(null); await reload() }} />}
      </Sheet>

      <Sheet open={status !== null} onClose={() => setStatus(null)} title={status ? `How is ${status.name}` : ''}>
        {status && <WaterStatusForm key={status.id + (status.status_at ?? '')} water={status} onDone={async () => { setStatus(null); await reload() }} />}
      </Sheet>

      <Sheet open={log !== null} onClose={() => setLog(null)} title={log ? `${log.name} catches` : ''}>
        {log && (
          <ul className="divide-y divide-tan-200">
            {at(log.id).map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => { setOpen(c); setLog(null) }} className="tap flex w-full items-center gap-3 py-2 text-left text-sm">
                  {c.photo_path && <Photo path={c.photo_path} className="h-12 w-12 shrink-0" />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-ink"><span className="font-semibold text-clay-950">{nameOf(c.member_id)}</span> · {catchLabel(c)}</span>
                    <span className="block text-xs text-ink-muted">{fmtDate(c.caught_on)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>

      <Sheet open={open !== null} onClose={() => setOpen(null)} title={open ? `${nameOf(open.member_id)} · ${catchLabel(open)}` : ''}>
        {open && (
          <div className="space-y-3">
            {open.photo_path && <Photo path={open.photo_path} className="max-h-72 w-full" />}
            <p className="text-sm text-ink">{fmtDate(open.caught_on)} · {waters?.find((w) => w.id === open.pin_id)?.name ?? 'somewhere'}</p>
            {open.notes && <p className="whitespace-pre-wrap text-ink">{open.notes}</p>}
            <p className="text-xs text-ink-muted">Logged by {nameOf(open.created_by)}</p>
            {(open.created_by === me.member_id || open.member_id === me.member_id || me.is_admin) && (
              <Button variant="ghost" onClick={() => remove(open)}>Remove</Button>
            )}
          </div>
        )}
      </Sheet>

      <Sheet open={editingWater !== null} onClose={() => setEditingWater(null)} title={editingWater === 'new' ? 'Add a water' : editingWater ? `Edit ${editingWater.name}` : ''}>
        {editingWater && <WaterForm key={editingWater === 'new' ? 'new' : editingWater.id} water={editingWater === 'new' ? null : editingWater} canRemove={me.is_admin} onDone={async () => { setEditingWater(null); await reload() }} />}
      </Sheet>
    </Screen>
  )
}

function CatchForm({ waters, water, onDone }: { waters: PinRow[]; water: PinRow | null; onDone: () => Promise<void> }) {
  const me = useMe()
  const { active } = useMembers()
  const [memberId, setMemberId] = useState(me.member_id ?? '')
  const [pinId, setPinId] = useState(water?.id ?? waters[0]?.id ?? '')
  const [date, setDate] = useState(todayISO())
  const [species, setSpecies] = useState<string>('Bass')
  const [other, setOther] = useState('')
  const [weight, setWeight] = useState('')
  const [length, setLength] = useState('')
  const [bait, setBait] = useState('')
  const [released, setReleased] = useState(false)
  const [notes, setNotes] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const finalSpecies = species === 'Other' ? other.trim() : species

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!finalSpecies || !memberId) return
    setBusy(true); setError(null)
    try {
      const photo_path = photo ? await uploadPhoto(photo) : null
      const { error } = await supabase.from('catches').insert({
        member_id: memberId, pin_id: pinId || null, caught_on: date, species: finalSpecies,
        weight_lb: weight ? Number(weight) : null, length_in: length ? Number(length) : null,
        bait: bait.trim() || null, notes: notes.trim() || null, released, photo_path,
      })
      if (error) throw error
      await onDone()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      {error && <Note kind="error">{error}</Note>}
      <div className="grid grid-cols-2 gap-3">
        <label className="block min-w-0">
          <span className="mb-1 block text-sm font-semibold text-clay-900">Who</span>
          <select value={memberId} onChange={(e) => setMemberId(e.target.value)} className="tap w-full rounded-md border border-tan-500 bg-white px-3 py-2.5 text-ink">
            {active.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <TextInput label="Date" name="catchDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <label className="block min-w-0">
        <span className="mb-1 block text-sm font-semibold text-clay-900">Where</span>
        <select value={pinId} onChange={(e) => setPinId(e.target.value)} className="tap w-full rounded-md border border-tan-500 bg-white px-3 py-2.5 text-ink">
          {waters.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </label>
      <div>
        <span className="mb-1 block text-sm font-semibold text-clay-900">What</span>
        <div className="flex flex-wrap gap-2">
          {FISH.map((f) => <button key={f} type="button" onClick={() => setSpecies(f)} aria-pressed={species === f} className={chip(species === f)}>{f}</button>)}
        </div>
        {species === 'Other' && <div className="mt-2"><TextInput name="otherFish" value={other} onChange={(e) => setOther(e.target.value)} placeholder="Gar, drum, carp…" maxLength={40} /></div>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextInput label="Weight (lb)" name="weight" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, ''))} placeholder="4" />
        <TextInput label="Length (in)" name="length" inputMode="decimal" value={length} onChange={(e) => setLength(e.target.value.replace(/[^\d.]/g, ''))} placeholder="18" />
      </div>
      <TextInput label="Bait or lure" name="bait" value={bait} onChange={(e) => setBait(e.target.value)} placeholder="green worm, topwater, chicken liver…" maxLength={80} list="baits" />
      <datalist id="baits"><option value="green worm" /><option value="topwater" /><option value="spinnerbait" /><option value="chicken liver" /><option value="minnow" /><option value="jig" /></datalist>
      <label className="tap flex items-center gap-3">
        <input type="checkbox" checked={released} onChange={(e) => setReleased(e.target.checked)} className="h-5 w-5 accent-clay-900" />
        <span className="text-sm font-semibold text-clay-900">Let it go</span>
      </label>
      <TextArea label="Notes" name="catchNotes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Off the dock at sunset…" rows={2} maxLength={1000} />
      <PhotoField file={photo} onFile={setPhoto} />
      <Button type="submit" full busy={busy} disabled={!finalSpecies}>Log it</Button>
    </form>
  )
}

function WaterStatusForm({ water, onDone }: { water: PinRow; onDone: () => Promise<void> }) {
  const me = useMe()
  const [level, setLevel] = useState<WaterLevel>(water.water_level)
  const [hasWell, setHasWell] = useState(water.has_well)
  const [wellOn, setWellOn] = useState(water.well_on)
  const [valves, setValves] = useState<Valve[]>(water.valves ?? [])
  const [condition, setCondition] = useState(water.condition ?? '')
  const [photo, setPhoto] = useState<File | null>(null)
  const [existingPhoto, setExistingPhoto] = useState<string | null>(water.photo_path)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const photo_path = photo ? await uploadPhoto(photo) : existingPhoto
      if (water.photo_path && water.photo_path !== photo_path) void removePhoto(water.photo_path)
      const { error } = await supabase.from('pins').update({
        water_level: level, condition: condition.trim() || null, photo_path,
        has_well: hasWell, well_on: hasWell && wellOn, valves: hasWell ? valves.filter((v) => v.name.trim()) : [],
        status_by: me.member_id, status_at: new Date().toISOString(),
      }).eq('id', water.id)
      if (error) throw error
      await onDone()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={save} className="space-y-4">
      {error && <Note kind="error">{error}</Note>}
      <div>
        <span className="mb-1 block text-sm font-semibold text-clay-900">Water level</span>
        <div className="flex gap-2">
          {(['full', 'down', 'low'] as WaterLevel[]).map((l) => <button key={l} type="button" onClick={() => setLevel(l)} aria-pressed={level === l} className={chip(level === l)}>{WATER_LEVEL[l]}</button>)}
        </div>
      </div>
      <div>
        <label className="tap flex items-center gap-3">
          <input type="checkbox" checked={hasWell} onChange={(e) => setHasWell(e.target.checked)} className="h-5 w-5 accent-clay-900" />
          <span className="text-sm font-semibold text-clay-900">Has a well</span>
        </label>
        {hasWell && (
          <div className="mt-2 space-y-2">
            <div className="flex gap-2">
              <button type="button" onClick={() => setWellOn(true)} aria-pressed={wellOn} className={chip(wellOn)}>Well running</button>
              <button type="button" onClick={() => setWellOn(false)} aria-pressed={!wellOn} className={chip(!wellOn)}>Well off</button>
            </div>
            {valves.map((v, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="min-w-0 flex-1"><TextInput name={`valve${i}`} aria-label={`Valve ${i + 1} name`} value={v.name} onChange={(e) => setValves((vs) => vs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Valve name" maxLength={40} /></div>
                <button type="button" onClick={() => setValves((vs) => vs.map((x, j) => (j === i ? { ...x, open: true } : x)))} aria-pressed={v.open} className={chip(v.open)}>Open</button>
                <button type="button" onClick={() => setValves((vs) => vs.map((x, j) => (j === i ? { ...x, open: false } : x)))} aria-pressed={!v.open} className={chip(!v.open)}>Closed</button>
                <button type="button" aria-label={`Remove ${v.name || 'valve'}`} onClick={() => setValves((vs) => vs.filter((_, j) => j !== i))} className="tap px-1 text-ink-muted">✕</button>
              </div>
            ))}
            <Button type="button" variant="ghost" onClick={() => setValves((vs) => [...vs, { name: `Valve ${vs.length + 1}`, open: false }])}>+ Add a valve</Button>
          </div>
        )}
      </div>
      <TextArea label="Anything to know" name="waterCondition" value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="Aerator off, moss on the east end, dock board loose…" rows={2} maxLength={300} />
      <PhotoField file={photo} onFile={setPhoto} existing={existingPhoto} onClear={() => setExistingPhoto(null)} label="Photo of it (optional)" />
      <Button type="submit" full busy={busy}>Save</Button>
    </form>
  )
}

function WaterForm({ water, canRemove, onDone }: { water: PinRow | null; canRemove: boolean; onDone: () => Promise<void> }) {
  const [name, setName] = useState(water?.name ?? '')
  const [acres, setAcres] = useState(water?.acres ? String(Number(water.acres)) : '')
  const [notes, setNotes] = useState(water?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function save(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true); setError(null)
    const row = { name: name.trim(), type: 'water' as const, acres: acres ? Number(acres) : null, notes: notes.trim() || null }
    const { error } = water ? await supabase.from('pins').update(row).eq('id', water.id) : await supabase.from('pins').insert(row)
    setBusy(false)
    if (error) return setError(friendlyError(error))
    await onDone()
  }
  async function remove() {
    if (!water) return
    setBusy(true)
    const { error } = await supabase.from('pins').update({ deleted_at: new Date().toISOString() }).eq('id', water.id)
    setBusy(false)
    if (error) return setError(friendlyError(error))
    await onDone()
  }
  return (
    <form onSubmit={save} className="space-y-3">
      {error && <Note kind="error">{error}</Note>}
      <TextInput label="Name" name="waterName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Front Tank, Big Lake…" maxLength={80} autoFocus={!water} />
      <TextInput label="About how many acres" name="waterAcres" inputMode="decimal" value={acres} onChange={(e) => setAcres(e.target.value.replace(/[^\d.]/g, ''))} placeholder="5" />
      <TextArea label="Notes" name="waterNotes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Stocked with bass in 2022, dock on the north side…" rows={2} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" busy={busy} disabled={!name.trim()}>{water ? 'Save' : 'Add it'}</Button>
        {water && canRemove && <Button type="button" variant="ghost" busy={busy} onClick={remove}>Remove</Button>}
      </div>
    </form>
  )
}
