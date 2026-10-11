import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button, Spinner } from '../components/Button'
import { TextInput } from '../components/Input'
import { Note } from '../components/Note'
import { Screen } from '../components/Screen'
import { Sheet } from '../components/Sheet'
import { claimStand, loadClaims, releaseClaim, SIT_LABEL, SITS } from '../lib/claims'
import type { PinRow, Sit, StandClaimRow } from '../lib/database.types'
import { addDays, fmtDate, parseISODate, todayISO } from '../lib/dates'
import { friendlyError } from '../lib/errors'
import { useMembers } from '../lib/members'
import { STAND_TYPES } from '../lib/pins'
import { useRealtime } from '../lib/realtime'
import { useMe } from '../lib/session'
import { supabase } from '../lib/supabase'

const DAYS = 7
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type Cell = { stand: PinRow; date: string; sit: Sit }

/** Week grid: stands down the side, days and AM/PM sits across the top. Tap a cell to claim or release. */
export function Stands() {
  const me = useMe()
  const navigate = useNavigate()
  const { nameOf } = useMembers()
  const today = todayISO()
  const [weekStart, setWeekStart] = useState(today)
  const [stands, setStands] = useState<PinRow[] | null>(null)
  const [claims, setClaims] = useState<StandClaimRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [cell, setCell] = useState<Cell | null>(null)

  const days = useMemo(() => Array.from({ length: DAYS }, (_, i) => addDays(weekStart, i)), [weekStart])
  const weekEnd = days[days.length - 1]

  const reload = useCallback(async () => {
    try {
      const [{ data, error }, c] = await Promise.all([
        supabase.from('pins').select('*').eq('type', 'stand').is('deleted_at', null).order('name'),
        loadClaims(weekStart, weekEnd),
      ])
      if (error) throw error
      setStands(data ?? [])
      setClaims(c)
    } catch (err) {
      setError(friendlyError(err))
    }
  }, [weekStart, weekEnd])

  useEffect(() => {
    void reload()
  }, [reload])
  useRealtime(['stand_claims', 'pins'], reload)

  const claimAt = (standId: string, date: string, sit: Sit) => claims.find((c) => c.stand_id === standId && c.date === date && c.sit === sit)

  const [day, setDay] = useState(today)
  const dayClaims = claims.filter((c) => c.date === day)

  return (
    <Screen title="Stands" back="/">
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
      {!stands ? (
        <div className="flex justify-center py-8 text-clay-900"><Spinner /></div>
      ) : stands.length === 0 ? (
        <Note>
          No stands on the map yet. {me.is_admin ? <button type="button" className="font-semibold underline" onClick={() => navigate('/map')}>Add them on the map.</button> : 'Ask the admin to add them on the map.'}
        </Note>
      ) : (
        <ul className="divide-y divide-tan-200 border-y border-tan-200">
          {stands.map((stand) => (
            <li key={stand.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold text-clay-950">{stand.name}</div>
                {stand.stand_type && <div className="text-xs text-ink-muted">{STAND_TYPES[stand.stand_type]}</div>}
              </div>
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
                    className={`tap flex h-12 w-[88px] shrink-0 flex-col items-center justify-center rounded-md text-xs font-bold leading-tight ring-1 ${
                      c ? (mine ? 'bg-clay-900 text-cream ring-clay-900' : 'bg-tan-300 text-clay-950 ring-tan-500') : past ? 'bg-cream-dark text-ink-muted ring-tan-200' : 'bg-white text-clay-950 ring-tan-400'
                    }`}
                  >
                    <span className={`text-[10px] ${c && mine ? 'text-cream/80' : 'text-ink-muted'}`}>{SIT_LABEL[s]}</span>
                    <span className="max-w-full truncate px-1">{c ? nameOf(c.member_id).split(' ')[0] : past ? '—' : 'Open'}</span>
                  </button>
                )
              })}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-ink-muted">Tap a sit to claim it or let it go. Burnt orange is you.</p>

      <ClaimSheet
        cell={cell}
        claim={cell ? claimAt(cell.stand.id, cell.date, cell.sit) : undefined}
        onClose={() => setCell(null)}
        onChanged={async () => { setCell(null); await reload() }}
      />
    </Screen>
  )
}

function ClaimSheet({ cell, claim, onClose, onChanged }: { cell: Cell | null; claim: StandClaimRow | undefined; onClose: () => void; onChanged: () => Promise<void> }) {
  const me = useMe()
  const { nameOf } = useMembers()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setNote('')
    setError(null)
  }, [cell])

  if (!cell) return null
  const past = cell.date < todayISO()
  const mine = claim?.member_id === me.member_id

  async function claim_(e: FormEvent) {
    e.preventDefault()
    if (!cell || !me.member_id) return
    setBusy(true)
    setError(null)
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
    setBusy(true)
    setError(null)
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
      <p className="mb-3 text-lg font-bold text-clay-950">
        {fmtDate(cell.date)} · {SIT_LABEL[cell.sit]} sit
      </p>
      {error && <Note kind="error" className="mb-3">{error}</Note>}
      {claim ? (
        <div className="space-y-3">
          <p className="text-ink">
            <strong>{mine ? 'You have' : `${nameOf(claim.member_id)} has`}</strong> this sit.
            {claim.note && <span className="block text-ink-muted">“{claim.note}”</span>}
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
          <Button type="submit" full busy={busy}>Claim stand</Button>
        </form>
      )}
    </Sheet>
  )
}
