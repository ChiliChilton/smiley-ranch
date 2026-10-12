import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button, Spinner } from '../components/Button'
import { TextArea, TextInput } from '../components/Input'
import { Note } from '../components/Note'
import { Screen } from '../components/Screen'
import { Sheet } from '../components/Sheet'
import { claimStand, loadClaims, releaseClaim, SIT_LABEL, SITS } from '../lib/claims'
import type { FeederFillRow, HarvestRow, PinRow, Sit, StandClaimRow, StandType } from '../lib/database.types'
import { addDays, fmtDate, fmtDateTime, parseISODate, todayISO } from '../lib/dates'
import { friendlyError } from '../lib/errors'
import { feederStatus, hasFeeder, lastFeedType, recordFill, STATUS_STYLE } from '../lib/feeders'
import { useMembers } from '../lib/members'
import { STAND_TYPES } from '../lib/pins'
import { useRealtime } from '../lib/realtime'
import { useMe } from '../lib/session'
import { mapsLink } from '../lib/share'
import { seasonLabel, seasonOf } from '../lib/species'
import { supabase } from '../lib/supabase'
import { FillDetailsSheet, HistorySheet } from './Feeders'

const DAYS = 7
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type Cell = { stand: PinRow; date: string; sit: Sit }

/**
 * One card per blind: who has it AM and PM on the day you pick, its feeder, and what's been
 * killed there. Standalone feeders (no blind) get a feeder-only card at the bottom.
 */
export function Blinds() {
  const me = useMe()
  const navigate = useNavigate()
  const { nameOf } = useMembers()
  const today = todayISO()
  const [weekStart, setWeekStart] = useState(today)
  const [day, setDay] = useState(today)
  const [pins, setPins] = useState<PinRow[] | null>(null)
  const [claims, setClaims] = useState<StandClaimRow[]>([])
  const [fills, setFills] = useState<Map<string, FeederFillRow>>(new Map())
  const [harvests, setHarvests] = useState<HarvestRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [cell, setCell] = useState<Cell | null>(null)
  const [justFilled, setJustFilled] = useState<{ feeder: PinRow; fill: FeederFillRow } | null>(null)
  const [history, setHistory] = useState<PinRow | null>(null)
  const [kills, setKills] = useState<PinRow | null>(null)
  const [editing, setEditing] = useState<PinRow | 'new' | null>(null)

  const days = useMemo(() => Array.from({ length: DAYS }, (_, i) => addDays(weekStart, i)), [weekStart])
  const weekEnd = days[days.length - 1]

  const reload = useCallback(async () => {
    try {
      const [{ data: p, error: e1 }, c, { data: f, error: e2 }, { data: h, error: e3 }] = await Promise.all([
        supabase.from('pins').select('*').is('deleted_at', null).order('name'),
        loadClaims(weekStart, weekEnd),
        supabase.from('feeder_fills').select('*').is('deleted_at', null).order('filled_at', { ascending: false }).limit(500),
        supabase.from('harvests').select('*').is('deleted_at', null).not('pin_id', 'is', null).order('harvested_on', { ascending: false }).limit(500),
      ])
      if (e1) throw e1
      if (e2) throw e2
      if (e3) throw e3
      setPins((p ?? []).filter((x) => x.type === 'stand' || x.type === 'feeder'))
      setClaims(c)
      const last = new Map<string, FeederFillRow>()
      for (const row of f ?? []) if (!last.has(row.feeder_id)) last.set(row.feeder_id, row)
      setFills(last)
      setHarvests(h ?? [])
    } catch (err) {
      setError(friendlyError(err))
    }
  }, [weekStart, weekEnd])

  useEffect(() => { void reload() }, [reload])
  useRealtime(['stand_claims', 'pins', 'feeder_fills', 'harvests'], reload)

  const blinds = (pins ?? []).filter((p) => p.type === 'stand')
  const looseFeeders = (pins ?? []).filter((p) => p.type === 'feeder')
  const dayClaims = claims.filter((c) => c.date === day)
  const claimAt = (standId: string, date: string, sit: Sit) => claims.find((c) => c.stand_id === standId && c.date === date && c.sit === sit)
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
    const { status, runsOut, daysLeft, mode, days: since } = feederStatus(p, fill)
    const st = STATUS_STYLE[status]
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

  return (
    <Screen title="Blinds" back="/" right={me.is_admin ? <button type="button" onClick={() => setEditing('new')} className="tap rounded-lg px-3 font-semibold active:bg-clay-800">Add</button> : <button type="button" onClick={() => navigate('/harvests')} className="tap rounded-lg px-3 font-semibold active:bg-clay-800">Harvests</button>}>
      {error && <Note kind="error" className="mb-3">{error}</Note>}

      <div className="mb-1 flex items-center justify-between">
        <Button variant="secondary" className="!px-3" aria-label="Earlier week" onClick={() => { const w = addDays(weekStart, -DAYS); setWeekStart(w); setDay(w) }} disabled={weekStart <= addDays(today, -DAYS * 4)}>‹</Button>
        <button type="button" onClick={() => { setWeekStart(today); setDay(today) }} className="tap px-2 text-sm font-bold text-clay-950">
          {fmtDate(weekStart, { weekday: false })} – {fmtDate(weekEnd, { weekday: false })}
        </button>
        <Button variant="secondary" className="!px-3" aria-label="Later week" onClick={() => { const w = addDays(weekStart, DAYS); setWeekStart(w); setDay(w) }}>›</Button>
      </div>
      <div className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {days.map((d) => {
          const dt = parseISODate(d)
          const weekend = dt.getDay() === 0 || dt.getDay() === 6
          const n = claims.filter((c) => c.date === d).length
          return (
            <button key={d} type="button" onClick={() => setDay(d)} aria-pressed={day === d} aria-label={fmtDate(d)} className={`tap flex w-[52px] shrink-0 flex-col items-center rounded-md py-1.5 ring-1 ${day === d ? 'bg-clay-900 text-cream ring-clay-900' : weekend ? 'bg-tan-200 text-clay-950 ring-tan-300' : 'bg-white text-clay-950 ring-tan-300'}`}>
              <span className="text-[10px] font-bold uppercase">{DOW[dt.getDay()]}</span>
              <span className="text-lg font-extrabold leading-tight">{dt.getDate()}</span>
              <span className={`text-[10px] ${day === d ? 'text-cream/80' : 'text-ink-muted'}`}>{n ? `${n} taken` : d === today ? 'today' : ' '}</span>
            </button>
          )
        })}
      </div>

      <h2 className="mb-2 text-xs font-extrabold uppercase tracking-[0.12em] text-clay-900">{fmtDate(day)}</h2>
      {!pins ? (
        <div className="flex justify-center py-8 text-clay-900"><Spinner /></div>
      ) : blinds.length === 0 && looseFeeders.length === 0 ? (
        <Note>
          No blinds yet. {me.is_admin ? <button type="button" className="font-semibold underline" onClick={() => setEditing('new')}>Add the first one.</button> : 'Ask the admin to set them up.'}
        </Note>
      ) : (
        <ul className="space-y-3">
          {blinds.map((stand) => (
            <li key={stand.id} className="rounded-2xl bg-white p-3 ring-1 ring-tan-200">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => (me.is_admin ? setEditing(stand) : setKills(stand))} className="tap min-w-0 flex-1 py-1 text-left">
                  <span className="block truncate font-bold text-clay-950">{stand.name}</span>
                  <span className="block text-xs text-ink-muted">{stand.stand_type ? STAND_TYPES[stand.stand_type] : 'Blind'}{stand.notes ? ` · ${stand.notes}` : ''}</span>
                </button>
                {SITS.map((s) => {
                  const c = dayClaims.find((x) => x.stand_id === stand.id && x.sit === s)
                  const mine = c?.member_id === me.member_id
                  const past = day < today
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setCell({ stand, date: day, sit: s })}
                      aria-label={`${stand.name}, ${fmtDate(day)} ${SIT_LABEL[s]}${c ? `, ${nameOf(c.member_id)}` : ', open'}`}
                      className={`tap flex h-12 w-[84px] shrink-0 flex-col items-center justify-center rounded-md text-xs font-bold leading-tight ring-1 ${
                        c ? (mine ? 'bg-clay-900 text-cream ring-clay-900' : 'bg-tan-300 text-clay-950 ring-tan-500') : past ? 'bg-cream-dark text-ink-muted ring-tan-200' : 'bg-white text-clay-950 ring-tan-400'
                      }`}
                    >
                      <span className={`text-[10px] ${c && mine ? 'text-cream/80' : 'text-ink-muted'}`}>{SIT_LABEL[s]}</span>
                      <span className="max-w-full truncate px-1">{c ? nameOf(c.member_id).split(' ')[0] : past ? '—' : 'Open'}</span>
                    </button>
                  )
                })}
              </div>
              {hasFeeder(stand) && <FeederLine p={stand} />}
              <KillsLine p={stand} />
              <Directions p={stand} />
            </li>
          ))}
          {looseFeeders.map((f) => (
            <li key={f.id} className="rounded-2xl bg-white p-3 ring-1 ring-tan-200">
              <button type="button" onClick={() => (me.is_admin ? setEditing(f) : setKills(f))} className="tap block w-full py-1 text-left font-bold text-clay-950">{f.name} <span className="text-xs font-semibold text-ink-muted">· feeder only{f.notes ? ` · ${f.notes}` : ''}</span></button>
              <FeederLine p={f} />
              <KillsLine p={f} />
              <Directions p={f} />
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-ink-muted">Tap a sit to claim it or let it go. Burnt orange is you. Fills record bags so the app can guess when the corn runs out.{me.is_admin ? ' Tap a name to edit it.' : ''}</p>

      <ClaimSheet
        cell={cell}
        claim={cell ? claimAt(cell.stand.id, cell.date, cell.sit) : undefined}
        onClose={() => setCell(null)}
        onChanged={async () => { setCell(null); await reload() }}
      />
      <FillDetailsSheet entry={justFilled} onClose={() => setJustFilled(null)} onSaved={async () => { setJustFilled(null); await reload() }} />
      <HistorySheet feeder={history} onClose={() => setHistory(null)} />
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add a blind or feeder' : editing ? `Edit ${editing.name}` : ''}>
        {editing && <BlindForm key={editing === 'new' ? 'new' : editing.id} pin={editing === 'new' ? null : editing} onDone={async () => { setEditing(null); await reload() }} />}
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

export function ClaimSheet({ cell, claim, onClose, onChanged }: { cell: Cell | null; claim: StandClaimRow | undefined; onClose: () => void; onChanged: () => Promise<void> }) {
  const me = useMe()
  const { nameOf } = useMembers()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { setNote(''); setError(null) }, [cell])

  if (!cell) return null
  const past = cell.date < todayISO()
  const mine = claim?.member_id === me.member_id

  async function claim_(e: FormEvent) {
    e.preventDefault()
    if (!cell || !me.member_id) return
    setBusy(true); setError(null)
    try {
      await claimStand(cell.stand.id, me.member_id, cell.date, cell.sit, note.trim() || null)
      await onChanged()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  async function release() {
    if (!claim || !me.member_id) return
    setBusy(true); setError(null)
    try {
      await releaseClaim(claim.id, me.member_id)
      await onChanged()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={true} onClose={onClose} title={cell.stand.name}>
      <p className="mb-3 text-lg font-bold text-clay-950">{fmtDate(cell.date)} · {SIT_LABEL[cell.sit]} sit</p>
      {error && <Note kind="error" className="mb-3">{error}</Note>}
      {claim ? (
        <div className="space-y-3">
          <p className="text-ink">
            <strong>{mine ? 'You have' : `${nameOf(claim.member_id)} has`}</strong> this sit.
            {claim.note && <span className="block text-ink-muted">“{claim.note}”</span>}
            <span className="block text-xs text-ink-muted">Claimed {fmtDateTime(claim.created_at)}</span>
          </p>
          {(mine || me.is_admin) && !past && (
            <Button variant="danger" busy={busy} onClick={release}>{mine ? 'Release my claim' : `Release ${nameOf(claim.member_id)}'s claim`}</Button>
          )}
        </div>
      ) : past ? (
        <p className="text-ink-muted">That sit is already past.</p>
      ) : (
        <form onSubmit={claim_} className="space-y-3">
          <TextInput label="Note (optional)" name="claimNote" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bringing my nephew…" maxLength={200} />
          <Button type="submit" full busy={busy}>Claim it</Button>
        </form>
      )}
    </Sheet>
  )
}

function Directions({ p }: { p: PinRow }) {
  if (p.lat == null || p.lng == null) return null
  return (
    <a href={mapsLink(String(p.lat), String(p.lng), p.name)} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-semibold text-clay-800 underline">Directions</a>
  )
}

/** Admin: name, kind, feeder settings, notes, and an optional GPS spot for Directions. */
function BlindForm({ pin, onDone }: { pin: PinRow | null; onDone: () => Promise<void> }) {
  const [name, setName] = useState(pin?.name ?? '')
  const [kind, setKind] = useState<'stand' | 'feeder'>(pin?.type === 'feeder' ? 'feeder' : 'stand')
  const [standType, setStandType] = useState<StandType>(pin?.stand_type ?? 'box_blind')
  const [feeder, setFeeder] = useState(pin ? hasFeeder(pin) : false)
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

  const chip = (on: boolean) => `tap rounded-md px-3 py-2 text-sm font-bold ring-1 ${on ? 'bg-clay-900 text-cream ring-clay-900' : 'bg-white text-clay-950 ring-tan-500'}`
  return (
    <form onSubmit={save} className="space-y-3">
      {error && <Note kind="error">{error}</Note>}
      <TextInput label="Name" name="blindName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Box Blind, North Ladder, Plot Feeder…" maxLength={80} autoFocus={!pin} />
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
      <TextArea label="Notes" name="blindNotes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Faces the creek bottom, 300 lb hopper…" rows={2} />
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
        {pin && <Button type="button" variant="ghost" busy={busy} onClick={remove}>Remove</Button>}
      </div>
    </form>
  )
}
