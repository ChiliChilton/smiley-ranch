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

  return (
    <Screen title="Stands">
      {error && <Note kind="error" className="mb-3">{error}</Note>}

      <div className="mb-3 flex items-center justify-between">
        <Button variant="secondary" className="!px-3" aria-label="Earlier week" onClick={() => setWeekStart(addDays(weekStart, -DAYS))} disabled={weekStart <= addDays(today, -DAYS * 4)}>
          ‹
        </Button>
        <button type="button" onClick={() => setWeekStart(today)} className="tap px-2 font-bold text-clay-950">
          {fmtDate(weekStart, { weekday: false })} – {fmtDate(weekEnd, { weekday: false })}
        </button>
        <Button variant="secondary" className="!px-3" aria-label="Later week" onClick={() => setWeekStart(addDays(weekStart, DAYS))}>
          ›
        </Button>
      </div>

      {!stands ? (
        <div className="flex justify-center py-8 text-clay-900"><Spinner /></div>
      ) : stands.length === 0 ? (
        <Note>
          No stands on the map yet. {me.is_admin ? <button type="button" className="font-semibold underline" onClick={() => navigate('/map')}>Add them on the map.</button> : 'Ask the admin to add them on the map.'}
        </Note>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2">
          <table className="border-separate border-spacing-1 text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-cream" />
                {days.map((d) => {
                  const dt = parseISODate(d)
                  const weekend = dt.getDay() === 0 || dt.getDay() === 6
                  return (
                    <th key={d} colSpan={2} className={`rounded-t-lg px-1 pt-1 text-center font-bold ${weekend ? 'bg-tan-200 text-clay-950' : 'text-ink-muted'} ${d === today ? 'underline' : ''}`}>
                      {DOW[dt.getDay()]} {dt.getDate()}
                    </th>
                  )
                })}
              </tr>
              <tr>
                <th className="sticky left-0 z-10 bg-cream" />
                {days.map((d) =>
                  SITS.map((s) => (
                    <th key={d + s} className="pb-1 text-center text-[10px] font-semibold text-ink-muted">{SIT_LABEL[s]}</th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {stands.map((stand) => (
                <tr key={stand.id}>
                  <th className="sticky left-0 z-10 max-w-[96px] bg-cream pr-2 text-left text-sm font-bold leading-tight text-clay-950">
                    <span className="block truncate">{stand.name}</span>
                    {stand.stand_type && <span className="block text-[10px] font-medium text-ink-muted">{STAND_TYPES[stand.stand_type]}</span>}
                  </th>
                  {days.map((d) =>
                    SITS.map((s) => {
                      const c = claimAt(stand.id, d, s)
                      const mine = c?.member_id === me.member_id
                      const past = d < today
                      return (
                        <td key={d + s} className="p-0">
                          <button
                            type="button"
                            onClick={() => setCell({ stand, date: d, sit: s })}
                            aria-label={`${stand.name}, ${fmtDate(d)} ${SIT_LABEL[s]}${c ? `, ${nameOf(c.member_id)}` : ', open'}`}
                            className={`tap h-12 w-12 rounded-lg text-[11px] font-bold leading-tight ring-1 ${
                              c
                                ? mine
                                  ? 'bg-clay-900 text-cream ring-clay-900'
                                  : 'bg-tan-300 text-clay-950 ring-tan-500'
                                : past
                                  ? 'bg-cream-dark text-transparent ring-tan-200'
                                  : 'bg-white text-tan-500 ring-tan-200'
                            }`}
                          >
                            {c ? <span className="block truncate px-0.5">{nameOf(c.member_id).split(' ')[0]}</span> : past ? '' : '+'}
                          </button>
                        </td>
                      )
                    }),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-xs text-ink-muted">Swipe sideways for more days. Burnt orange is you.</p>
        </div>
      )}

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
