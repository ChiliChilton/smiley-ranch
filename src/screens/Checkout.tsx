import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button, Spinner } from '../components/Button'
import { Card } from '../components/Card'
import { TextArea } from '../components/Input'
import { Note } from '../components/Note'
import { Screen } from '../components/Screen'
import type { ChecklistItemRow, CheckoutRow, FeederFillRow, PinRow } from '../lib/database.types'
import { fmtDateTime } from '../lib/dates'
import { friendlyError } from '../lib/errors'
import { feederStatus, hasFeeder, loadFeeders } from '../lib/feeders'
import { loadPins, pinIssues } from '../lib/pins'
import { useMembers } from '../lib/members'
import { useRealtime } from '../lib/realtime'
import { useMe } from '../lib/session'
import { createRow } from '../lib/outbox'
import { supabase } from '../lib/supabase'

export async function loadLastCheckout(): Promise<CheckoutRow | null> {
  const { data } = await supabase
    .from('checkouts')
    .select('*')
    .is('deleted_at', null)
    .order('left_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ?? null
}

/** "Before you leave": tick the list, add a note, tap "I'm heading out". */
export function Checkout() {
  const me = useMe()
  const navigate = useNavigate()
  const { nameOf } = useMembers()
  const [items, setItems] = useState<ChecklistItemRow[] | null>(null)
  const [last, setLast] = useState<CheckoutRow | null>(null)
  const [know, setKnow] = useState<{ text: string; to: string }[]>([])
  const [done, setDone] = useState<Set<string>>(new Set())
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<CheckoutRow | null>(null)

  const reload = useCallback(async () => {
    const [{ data, error }, lastRow, pins, fd] = await Promise.all([
      supabase.from('checklist_items').select('*').is('deleted_at', null).order('sort_order').order('created_at'),
      loadLastCheckout(),
      loadPins().catch(() => [] as PinRow[]),
      loadFeeders().catch(() => null),
    ])
    if (error) setError(friendlyError(error))
    else setItems(data ?? [])
    setLast(lastRow)
    setKnow(knowBeforeYouGo(pins, fd?.lastFill ?? new Map()))
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])
  useRealtime(['checklist_items', 'checkouts', 'pins', 'feeder_fills'], reload)

  function toggle(id: string) {
    setDone((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function headOut() {
    if (!items || !me.member_id) return
    setBusy(true)
    setError(null)
    const snapshot = items.map((i) => ({ id: i.id, title: i.title, done: done.has(i.id) }))
    const allDone = snapshot.every((i) => i.done)
    try {
      const leftAt = new Date().toISOString()
      const { row } = await createRow('checkouts', { member_id: me.member_id, left_at: leftAt, items: snapshot, all_done: allDone, notes: notes.trim() || null })
      setSaved({ ...row, event_id: null, created_by: me.member_id, created_at: leftAt, deleted_at: null })
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  if (saved) {
    const missed = saved.items.filter((i) => !i.done)
    return (
      <Screen title="Before you leave">
        <Card>
          <p className="text-xl font-bold text-clay-950">You're checked out.</p>
          <p className="mt-1 text-ink-muted">{fmtDateTime(saved.left_at)}</p>
          {missed.length === 0 ? (
            <Note kind="ok" className="mt-3">Everything on the list is done. Safe travels.</Note>
          ) : (
            <Note kind="warn" className="mt-3">
              Skipped: {missed.map((i) => i.title).join(', ')}. The family can see that.
            </Note>
          )}
        </Card>
        <div className="mt-4">
          <Button full onClick={() => navigate('/')}>Back home</Button>
        </div>
      </Screen>
    )
  }

  const total = items?.length ?? 0
  const count = items ? items.filter((i) => done.has(i.id)).length : 0

  return (
    <Screen title="Before you leave">
      {error && <Note kind="error" className="mb-3">{error}</Note>}
      {last && (
        <p className="mb-3 text-sm text-ink-muted">
          Last out: <strong className="text-ink">{nameOf(last.member_id)}</strong>, {fmtDateTime(last.left_at)}
          {last.all_done ? ' · all done' : ` · skipped ${last.items.filter((i) => !i.done).length}`}
        </p>
      )}

      {know.length > 0 && (
        <Card title="Know before you go" className="mb-4">
          <ul className="space-y-1.5">
            {know.map((k, i) => (
              <li key={i} className="flex items-center gap-2 text-[15px] text-ink">
                <span className="min-w-0 flex-1">{k.text}</span>
                <button type="button" onClick={() => navigate(k.to)} className="tap shrink-0 rounded-md bg-tan-200 px-3 py-1.5 text-sm font-semibold text-clay-950 active:bg-tan-300">Update</button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!items ? (
        <div className="flex justify-center py-8 text-clay-900"><Spinner /></div>
      ) : items.length === 0 ? (
        <Note>The admin hasn't set up the list yet. {me.is_admin && <button type="button" className="font-semibold underline" onClick={() => navigate('/more/checklist')}>Set it up</button>}</Note>
      ) : (
        <ul className="space-y-2">
          {items.map((i) => {
            const on = done.has(i.id)
            return (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => toggle(i.id)}
                  aria-pressed={on}
                  className={`tap flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-base ring-1 ${
                    on ? 'bg-clay-100 ring-clay-600' : 'bg-white ring-tan-200'
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${
                      on ? 'border-clay-900 bg-clay-900 text-cream' : 'border-tan-600 bg-white'
                    }`}
                    aria-hidden
                  >
                    {on && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <span className={`font-semibold ${on ? 'text-clay-900' : 'text-ink'}`}>{i.title}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {items && items.length > 0 && (
        <div className="mt-4 space-y-3">
          <TextArea label="Anything to pass on?" name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional. Left the gate chained, propane is low…" rows={2} />
          <Button full busy={busy} onClick={headOut} variant={count === total ? 'primary' : 'secondary'}>
            I'm heading out{count < total ? ` (${count} of ${total} done)` : ''}
          </Button>
        </div>
      )}
    </Screen>
  )
}

/** Live status the person leaving should look at: wells running, valves open, low water, blinds with a problem, feeders due. */
export function knowBeforeYouGo(spots: PinRow[], lastFill: Map<string, FeederFillRow>): { text: string; to: string }[] {
  const out: { text: string; to: string }[] = []
  for (const p of spots) {
    if (p.type === 'water') {
      if (p.has_well && p.well_on) {
        const open = (p.valves ?? []).filter((v) => v.open).map((v) => v.name)
        out.push({ text: `${p.name}: well running${open.length ? `, ${open.join(' and ')} open` : ''}`, to: '/fishing' })
      } else if (p.has_well && (p.valves ?? []).some((v) => v.open)) {
        out.push({ text: `${p.name}: well off, ${(p.valves ?? []).filter((v) => v.open).map((v) => v.name).join(' and ')} still open`, to: '/fishing' })
      }
      if (p.water_level === 'low') out.push({ text: `${p.name}: water is low`, to: '/fishing' })
      if (p.condition?.trim()) out.push({ text: `${p.name}: ${p.condition.trim()}`, to: '/fishing' })
      continue
    }
    const issues = pinIssues(p)
    if (issues.length) out.push({ text: `${p.name}: ${issues.join(', ')}`, to: '/blinds' })
    if (hasFeeder(p)) {
      const st = feederStatus(p, lastFill.get(p.id))
      if (st.status === 'overdue') out.push({ text: `${p.name} feeder: overdue`, to: '/blinds' })
      else if (st.status === 'due') out.push({ text: `${p.name} feeder: due a fill`, to: '/blinds' })
    }
  }
  return out
}
