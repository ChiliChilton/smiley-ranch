import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button, Spinner } from '../components/Button'
import { TextArea, TextInput } from '../components/Input'
import { Note } from '../components/Note'
import { Screen } from '../components/Screen'
import { Sheet } from '../components/Sheet'
import type { CameraStatus, FeederFillRow, HarvestRow, LockStatus, MotorStatus, PinRow, StandType } from '../lib/database.types'
import { fmtDate, fmtDateTime, todayISO } from '../lib/dates'
import { friendlyError } from '../lib/errors'
import { feederStatus, hasFeeder, lastFeedType, recordFill, STATUS_STYLE } from '../lib/feeders'
import { useMembers } from '../lib/members'
import { CAMERA, LOCK, MOTOR, pinIssues, STAND_TYPES } from '../lib/pins'
import { useRealtime } from '../lib/realtime'
import { useMe } from '../lib/session'
import { mapsLink } from '../lib/share'
import { seasonLabel, seasonOf } from '../lib/species'
import { supabase } from '../lib/supabase'
import { FillDetailsSheet, HistorySheet } from './Feeders'

/**
 * Hunting spots that need upkeep. One card per blind (and per feeder with no blind):
 * feeder and run-out guess, motor, lock, chairs, trail cam, a condition line, and what's
 * been killed there. Anyone can add a spot or update its status.
 */
export function Blinds() {
  const me = useMe()
  const navigate = useNavigate()
  const { nameOf } = useMembers()
  const today = todayISO()
  const [pins, setPins] = useState<PinRow[] | null>(null)
  const [fills, setFills] = useState<Map<string, FeederFillRow>>(new Map())
  const [harvests, setHarvests] = useState<HarvestRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [justFilled, setJustFilled] = useState<{ feeder: PinRow; fill: FeederFillRow } | null>(null)
  const [history, setHistory] = useState<PinRow | null>(null)
  const [kills, setKills] = useState<PinRow | null>(null)
  const [status, setStatus] = useState<PinRow | null>(null)
  const [editing, setEditing] = useState<PinRow | 'new' | null>(null)

  const reload = useCallback(async () => {
    try {
      const [{ data: p, error: e1 }, { data: f, error: e2 }, { data: h, error: e3 }] = await Promise.all([
        supabase.from('pins').select('*').is('deleted_at', null).order('name'),
        supabase.from('feeder_fills').select('*').is('deleted_at', null).order('filled_at', { ascending: false }).limit(500),
        supabase.from('harvests').select('*').is('deleted_at', null).not('pin_id', 'is', null).order('harvested_on', { ascending: false }).limit(500),
      ])
      if (e1) throw e1
      if (e2) throw e2
      if (e3) throw e3
      const spots = (p ?? []).filter((x) => x.type === 'stand' || x.type === 'feeder')
      setPins(spots)
      const last = new Map<string, FeederFillRow>()
      for (const row of f ?? []) if (!last.has(row.feeder_id)) last.set(row.feeder_id, row)
      setFills(last)
      setHarvests(h ?? [])
      setStatus((cur) => (cur ? (spots.find((x) => x.id === cur.id) ?? null) : null))
    } catch (err) {
      setError(friendlyError(err))
    }
  }, [])

  useEffect(() => { void reload() }, [reload])
  useRealtime(['pins', 'feeder_fills', 'harvests'], reload)

  const thisSeason = seasonOf(today)
  const killsAt = (id: string) => harvests.filter((h) => h.pin_id === id)

  async function filled(p: PinRow) {
    setError(null)
    try {
      const fill = await recordFill(p.id, { feed_type: lastFeedType() || null })
      setJustFilled({ feeder: p, fill })
      await reload()
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  function FeederLine({ p }: { p: PinRow }) {
    const fill = fills.get(p.id)
    const { status: st0, runsOut, daysLeft, mode, days: since } = feederStatus(p, fill)
    const st = STATUS_STYLE[st0]
    const estimate =
      mode === 'bags' && runsOut
        ? daysLeft! < 0 ? `ran out about ${fmtDate(runsOut, { weekday: false })}` : daysLeft === 0 ? 'runs out today' : `runs out about ${fmtDate(runsOut, { weekday: false })}`
        : mode === 'interval' ? `every ${p.fill_interval_days} days${since != null ? `, ${since} days ago` : ''}` : null
    const [busy, setBusy] = useState(false)
    return (
      <div className="mt-2 flex items-center gap-2 border-t border-tan-200 pt-2">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${st.dot}`} aria-hidden />
        <button type="button" onClick={() => setHistory(p)} className="tap min-w-0 flex-1 py-0.5 text-left text-sm">
          <span className="font-semibold text-clay-950">Feeder</span>{' '}
          <span className="text-ink">
            {fill ? `${fill.bags != null ? `${fill.bags} bag${Number(fill.bags) === 1 ? '' : 's'} ` : ''}${fmtDate(fill.filled_at.slice(0, 10), { weekday: false })} by ${nameOf(fill.created_by).split(' ')[0]}` : 'never filled'}
            {estimate ? `, ${estimate}` : ''}
          </span>
        </button>
        <Button variant="secondary" className="!min-h-0 !px-3 !py-1.5 text-sm" busy={busy} onClick={async () => { setBusy(true); try { await filled(p) } finally { setBusy(false) } }}>Filled it</Button>
      </div>
    )
  }

  function StatusLine({ p }: { p: PinRow }) {
    const parts: { text: string; bad: boolean }[] = []
    if (hasFeeder(p)) parts.push({ text: MOTOR[p.motor_status], bad: p.motor_status === 'down' })
    parts.push({ text: LOCK[p.lock_status], bad: false })
    if (p.type === 'stand') parts.push({ text: `${p.chairs} chair${p.chairs === 1 ? '' : 's'}`, bad: p.chairs === 0 })
    parts.push(p.has_camera ? { text: CAMERA[p.camera_status], bad: p.camera_status !== 'working' } : { text: 'No trail cam', bad: false })
    return (
      <button type="button" onClick={() => setStatus(p)} aria-label={`${p.name} status`} className="tap mt-2 block w-full border-t border-tan-200 pt-2 text-left">
        <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-sm">
          {parts.map((x, i) => (
            <span key={i} className={x.bad ? 'font-semibold text-alert' : 'text-ink'}>{x.text}{i < parts.length - 1 ? ' ·' : ''}</span>
          ))}
        </span>
        {p.condition && <span className="block text-sm font-semibold text-alert">{p.condition}</span>}
        <span className="block text-xs text-ink-muted">
          {p.status_at ? `${nameOf(p.status_by)}, ${fmtDateTime(p.status_at)}` : 'Nobody has checked it yet'} · tap to update
        </span>
      </button>
    )
  }

  function KillsLine({ p }: { p: PinRow }) {
    const all = killsAt(p.id)
    if (all.length === 0) return <p className="mt-1 text-xs text-ink-muted">Nothing taken here yet.</p>
    const season = all.filter((h) => seasonOf(h.harvested_on) === thisSeason)
    const last = all[0]
    return (
      <button type="button" onClick={() => setKills(p)} className="tap mt-1 block w-full py-0.5 text-left text-xs text-ink-muted">
        <span className="font-semibold text-clay-900">Killed here:</span> {season.length} this season, {all.length} all time. Last: {nameOf(last.member_id).split(' ')[0]}, {last.species.toLowerCase()}{last.description ? ` (${last.description})` : ''}, {fmtDate(last.harvested_on, { weekday: false })}.
      </button>
    )
  }

  function Links({ p }: { p: PinRow }) {
    const issue = pinIssues(p)[0]
    return (
      <div className="mt-1 flex flex-wrap gap-x-4 text-xs font-semibold text-clay-800">
        {p.lat != null && p.lng != null && <a href={mapsLink(String(p.lat), String(p.lng), p.name)} target="_blank" rel="noreferrer" className="underline">Directions</a>}
        <button type="button" className="underline" onClick={() => navigate(`/todos/new?title=${encodeURIComponent(`${p.name}: ${issue ?? ''}`.trim().replace(/:$/, ''))}&pin=${p.id}`)}>+ Project</button>
      </div>
    )
  }

  return (
    <Screen title="Blinds" back="/" right={<button type="button" onClick={() => setEditing('new')} className="tap rounded-lg px-3 font-semibold active:bg-clay-800">Add</button>}>
      {error && <Note kind="error" className="mb-3">{error}</Note>}
      {!pins ? (
        <div className="flex justify-center py-8 text-clay-900"><Spinner /></div>
      ) : pins.length === 0 ? (
        <Note>No blinds yet. <button type="button" className="font-semibold underline" onClick={() => setEditing('new')}>Add the first one.</button></Note>
      ) : (
        <ul className="space-y-3">
          {pins.map((p) => (
            <li key={p.id} className="rounded-2xl bg-white p-3 ring-1 ring-tan-200">
              <button type="button" onClick={() => setEditing(p)} className="tap block w-full py-0.5 text-left">
                <span className="block truncate font-bold text-clay-950">{p.name}</span>
                <span className="block text-xs text-ink-muted">{p.type === 'feeder' ? 'Feeder only' : p.stand_type ? STAND_TYPES[p.stand_type] : 'Blind'}{p.notes ? ` · ${p.notes}` : ''}</span>
              </button>
              {hasFeeder(p) && <FeederLine p={p} />}
              <StatusLine p={p} />
              <KillsLine p={p} />
              <Links p={p} />
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-ink-muted">Tap a name to edit the spot, the status line to say how it's doing, Filled it when you put corn in. Anyone can add a blind.</p>

      <FillDetailsSheet entry={justFilled} onClose={() => setJustFilled(null)} onSaved={async () => { setJustFilled(null); await reload() }} />
      <HistorySheet feeder={history} onClose={() => setHistory(null)} />

      <Sheet open={status !== null} onClose={() => setStatus(null)} title={status ? `How is ${status.name}` : ''}>
        {status && <StatusForm key={status.id + (status.status_at ?? '')} pin={status} onDone={async () => { setStatus(null); await reload() }} />}
      </Sheet>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add a blind or feeder' : editing ? `Edit ${editing.name}` : ''}>
        {editing && <BlindForm key={editing === 'new' ? 'new' : editing.id} pin={editing === 'new' ? null : editing} canRemove={me.is_admin} onDone={async () => { setEditing(null); await reload() }} />}
      </Sheet>

      <Sheet open={kills !== null} onClose={() => setKills(null)} title={kills ? `Killed at ${kills.name}` : ''}>
        {kills && killsAt(kills.id).length === 0 && <p className="text-sm text-ink-muted">Nothing taken here yet.</p>}
        {kills && (
          <ul className="divide-y divide-tan-200">
            {killsAt(kills.id).map((h) => (
              <li key={h.id} className="py-2 text-sm text-ink">
                <span className="font-semibold text-clay-950">{nameOf(h.member_id)}</span> · {h.species}{h.description ? ` · ${h.description}` : ''}
                <span className="block text-xs text-ink-muted">{fmtDate(h.harvested_on)} · {seasonLabel(seasonOf(h.harvested_on))} season</span>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </Screen>
  )
}

const chip = (on: boolean) => `tap rounded-md px-3 py-2 text-sm font-bold ring-1 ${on ? 'bg-clay-900 text-cream ring-clay-900' : 'bg-white text-clay-950 ring-tan-500'}`

/** Anyone: how the spot is doing right now. */
function StatusForm({ pin, onDone }: { pin: PinRow; onDone: () => Promise<void> }) {
  const me = useMe()
  const [motor, setMotor] = useState<MotorStatus>(pin.motor_status)
  const [lock, setLock] = useState<LockStatus>(pin.lock_status)
  const [chairs, setChairs] = useState(pin.chairs)
  const [cam, setCam] = useState(pin.has_camera)
  const [camStatus, setCamStatus] = useState<CameraStatus>(pin.camera_status)
  const [condition, setCondition] = useState(pin.condition ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const { error } = await supabase.from('pins').update({
      motor_status: motor, lock_status: lock, chairs, has_camera: cam, camera_status: cam ? camStatus : 'working',
      condition: condition.trim() || null, status_by: me.member_id, status_at: new Date().toISOString(),
    }).eq('id', pin.id)
    setBusy(false)
    if (error) return setError(friendlyError(error))
    await onDone()
  }

  return (
    <form onSubmit={save} className="space-y-4">
      {error && <Note kind="error">{error}</Note>}
      {hasFeeder(pin) && (
        <div>
          <span className="mb-1 block text-sm font-semibold text-clay-900">Feeder motor</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setMotor('working')} aria-pressed={motor === 'working'} className={chip(motor === 'working')}>Working</button>
            <button type="button" onClick={() => setMotor('down')} aria-pressed={motor === 'down'} className={chip(motor === 'down')}>Down</button>
          </div>
        </div>
      )}
      <div>
        <span className="mb-1 block text-sm font-semibold text-clay-900">Lock</span>
        <div className="flex gap-2">
          {(['locked', 'unlocked', 'none'] as LockStatus[]).map((l) => (
            <button key={l} type="button" onClick={() => setLock(l)} aria-pressed={lock === l} className={chip(lock === l)}>{LOCK[l]}</button>
          ))}
        </div>
      </div>
      {pin.type === 'stand' && (
        <div>
          <span className="mb-1 block text-sm font-semibold text-clay-900">Chairs in the blind</span>
          <div className="flex items-center gap-3">
            <Button type="button" variant="secondary" className="!px-4" aria-label="Fewer chairs" onClick={() => setChairs((c) => Math.max(0, c - 1))}>−</Button>
            <span className="w-8 text-center text-xl font-extrabold text-clay-950" aria-live="polite">{chairs}</span>
            <Button type="button" variant="secondary" className="!px-4" aria-label="More chairs" onClick={() => setChairs((c) => Math.min(20, c + 1))}>+</Button>
          </div>
        </div>
      )}
      <div>
        <label className="tap flex items-center gap-3">
          <input type="checkbox" checked={cam} onChange={(e) => setCam(e.target.checked)} className="h-5 w-5 accent-clay-900" />
          <span className="text-sm font-semibold text-clay-900">Trail cam here</span>
        </label>
        {cam && (
          <div className="mt-2 flex flex-wrap gap-2">
            {(['working', 'batteries', 'down'] as CameraStatus[]).map((c) => (
              <button key={c} type="button" onClick={() => setCamStatus(c)} aria-pressed={camStatus === c} className={chip(camStatus === c)}>{c === 'working' ? 'Working' : c === 'batteries' ? 'Needs batteries or card' : 'Down'}</button>
            ))}
          </div>
        )}
      </div>
      <TextArea label="Anything wrong with it" name="condition" value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="Window latch broken, wasps, leg rotted…" rows={2} maxLength={300} />
      <Button type="submit" full busy={busy}>Save</Button>
    </form>
  )
}

/** Anyone: name, kind, feeder settings, notes, and an optional GPS spot for Directions. Admin can remove. */
function BlindForm({ pin, canRemove, onDone }: { pin: PinRow | null; canRemove: boolean; onDone: () => Promise<void> }) {
  const [name, setName] = useState(pin?.name ?? '')
  const [kind, setKind] = useState<'stand' | 'feeder'>(pin?.type === 'feeder' ? 'feeder' : 'stand')
  const [standType, setStandType] = useState<StandType>(pin?.stand_type ?? 'box_blind')
  const [feeder, setFeeder] = useState(pin ? hasFeeder(pin) : true)
  const [daysPerBag, setDaysPerBag] = useState(pin?.days_per_bag ? String(pin.days_per_bag) : '')
  const [interval, setInterval_] = useState(pin?.fill_interval_days ? String(pin.fill_interval_days) : '')
  const [notes, setNotes] = useState(pin?.notes ?? '')
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(pin?.lat != null && pin.lng != null ? { lat: pin.lat, lng: pin.lng } : null)
  const [locating, setLocating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const feederish = kind === 'feeder' || feeder

  function useMyLocation() {
    if (!navigator.geolocation) return setError("This phone can't share its location.")
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (p) => { setLocating(false); setPos({ lat: Number(p.coords.latitude.toFixed(5)), lng: Number(p.coords.longitude.toFixed(5)) }) },
      () => { setLocating(false); setError("Couldn't get your location. Check Location Services for Smiley Ranch.") },
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true); setError(null)
    const row = {
      name: name.trim(),
      type: kind,
      stand_type: kind === 'stand' ? standType : null,
      has_feeder: feederish,
      days_per_bag: feederish && daysPerBag ? Number(daysPerBag) : null,
      fill_interval_days: feederish && interval ? Number(interval) : null,
      notes: notes.trim() || null,
      lat: pos?.lat ?? null,
      lng: pos?.lng ?? null,
    }
    const { error } = pin ? await supabase.from('pins').update(row).eq('id', pin.id) : await supabase.from('pins').insert(row)
    setBusy(false)
    if (error) return setError(friendlyError(error))
    await onDone()
  }

  async function remove() {
    if (!pin) return
    setBusy(true)
    const { error } = await supabase.from('pins').update({ deleted_at: new Date().toISOString() }).eq('id', pin.id)
    setBusy(false)
    if (error) return setError(friendlyError(error))
    await onDone()
  }

  return (
    <form onSubmit={save} className="space-y-3">
      {error && <Note kind="error">{error}</Note>}
      <TextInput label="Name" name="blindName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tank Blind, Brants Blind, Plot Feeder…" maxLength={80} autoFocus={!pin} />
      <div>
        <span className="mb-1 block text-sm font-semibold text-clay-900">What is it</span>
        <div className="flex gap-2">
          <button type="button" onClick={() => setKind('stand')} aria-pressed={kind === 'stand'} className={chip(kind === 'stand')}>Blind</button>
          <button type="button" onClick={() => setKind('feeder')} aria-pressed={kind === 'feeder'} className={chip(kind === 'feeder')}>Feeder only</button>
        </div>
      </div>
      {kind === 'stand' && (
        <>
          <div>
            <span className="mb-1 block text-sm font-semibold text-clay-900">Kind of blind</span>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(STAND_TYPES) as StandType[]).map((st) => (
                <button key={st} type="button" onClick={() => setStandType(st)} aria-pressed={standType === st} className={chip(standType === st)}>{STAND_TYPES[st]}</button>
              ))}
            </div>
          </div>
          <label className="tap flex items-center gap-3">
            <input type="checkbox" checked={feeder} onChange={(e) => setFeeder(e.target.checked)} className="h-5 w-5 accent-clay-900" />
            <span className="text-sm font-semibold text-clay-900">This blind has its own feeder</span>
          </label>
        </>
      )}
      {feederish && (
        <div className="grid grid-cols-2 gap-3">
          <TextInput label="A bag lasts about (days)" name="daysPerBag" inputMode="decimal" value={daysPerBag} onChange={(e) => setDaysPerBag(e.target.value.replace(/[^\d.]/g, ''))} hint="Used to guess when it runs out." />
          <TextInput label="Or fill every (days)" name="fillDays" inputMode="numeric" value={interval} onChange={(e) => setInterval_(e.target.value.replace(/\D/g, ''))} hint="Fallback when bags aren't recorded." />
        </div>
      )}
      <TextArea label="Notes" name="blindNotes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="By the stock tank, 300 lb hopper…" rows={2} />
      <div>
        <span className="mb-1 block text-sm font-semibold text-clay-900">Spot (optional)</span>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" busy={locating} onClick={useMyLocation}>{pos ? 'Update my location' : 'Use my location'}</Button>
          {pos && <span className="font-mono text-xs text-ink-muted">{pos.lat}, {pos.lng}</span>}
          {pos && <Button type="button" variant="ghost" onClick={() => setPos(null)}>Clear</Button>}
        </div>
        <p className="mt-1 text-xs text-ink-muted">Stand at it and tap that once. Everyone then gets a Directions link that opens their maps app.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" busy={busy} disabled={!name.trim()}>{pin ? 'Save' : 'Add it'}</Button>
        {pin && canRemove && <Button type="button" variant="ghost" busy={busy} onClick={remove}>Remove</Button>}
      </div>
    </form>
  )
}
