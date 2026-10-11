import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { CheckinRow } from '../lib/database.types'
import { checkIn, checkOut, isOverdue, loadOpenCheckins } from '../lib/checkins'
import { fmtDateTime } from '../lib/dates'
import { friendlyError } from '../lib/errors'
import { useMembers } from '../lib/members'
import { useRealtime } from '../lib/realtime'
import { useMe } from '../lib/session'
import { Button } from './Button'
import { Section } from './Section'
import { TextInput } from './Input'
import { Note } from './Note'
import { Sheet } from './Sheet'

const localDatetime = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Home: who's on the place right now, with I'm here / I'm out. */
export function CheckinCard() {
  const me = useMe()
  const { nameOf } = useMembers()
  const [open, setOpen] = useState<CheckinRow[] | null>(null)
  const [sheet, setSheet] = useState(false)
  const [backBy, setBackBy] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try { setOpen(await loadOpenCheckins()) } catch (err) { setError(friendlyError(err)) }
  }, [])
  useEffect(() => { void reload() }, [reload])
  useRealtime(['checkins'], reload)

  const mine = open?.find((c) => c.member_id === me.member_id)

  function openSheet() {
    const d = new Date(); d.setHours(d.getHours() + 4, 0, 0, 0)
    setBackBy(localDatetime(d)); setNote(''); setSheet(true)
  }

  async function here(e: FormEvent) {
    e.preventDefault()
    if (!me.member_id) return
    setBusy(true); setError(null)
    try {
      await checkIn(me.member_id, backBy ? new Date(backBy).toISOString() : null, note.trim() || null)
      setSheet(false); await reload()
    } catch (err) { setError(friendlyError(err)) } finally { setBusy(false) }
  }

  async function out(memberId: string) {
    if (!me.member_id) return
    setBusy(true); setError(null)
    try { await checkOut(memberId, me.member_id); await reload() } catch (err) { setError(friendlyError(err)) } finally { setBusy(false) }
  }

  return (
    <Section title="On the place" count={open?.length ?? undefined} action={mine ? <Button variant="secondary" className="!min-h-0 !px-3 !py-1.5 text-sm" busy={busy} onClick={() => out(me.member_id!)}>I'm out</Button> : <Button className="!min-h-0 !px-3 !py-1.5 text-sm" onClick={openSheet}>I'm here</Button>}>
      {error && <Note kind="error" className="mb-2">{error}</Note>}
      {!open ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : open.length === 0 ? (
        <p className="py-1 text-sm text-ink-muted">Nobody right now.</p>
      ) : (
        <ul className="space-y-1.5">
          {open.map((c) => {
            const late = isOverdue(c)
            return (
              <li key={c.id} className="flex items-start gap-2 text-sm">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${late ? 'bg-alert' : 'bg-ok'}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <strong className="text-clay-950">{nameOf(c.member_id)}</strong>
                  <span className="text-ink-muted"> since {fmtDateTime(c.arrived_at)}</span>
                  {c.expected_back && <span className={late ? 'block font-semibold text-alert' : 'block text-ink-muted'}>{late ? 'Was due back' : 'Back by'} {fmtDateTime(c.expected_back)}</span>}
                  {c.note && <span className="block text-ink-muted">“{c.note}”</span>}
                </span>
                {(c.member_id === me.member_id || me.is_admin) && c.member_id !== me.member_id && (
                  <Button variant="ghost" className="!min-h-0 !px-2 !py-1 text-sm" busy={busy} onClick={() => out(c.member_id)}>Mark out</Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <Sheet open={sheet} onClose={() => setSheet(false)} title="I'm here">
        <form onSubmit={here} className="space-y-3">
          <TextInput label="Back by (optional)" name="backBy" type="datetime-local" value={backBy} onChange={(e) => setBackBy(e.target.value)} hint="If you're not out by then, the family gets a heads-up." />
          <TextInput label="Note (optional)" name="checkinNote" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Sitting the box blind, truck at the barn…" maxLength={200} />
          <div className="flex gap-2">
            <Button type="submit" busy={busy}>I'm here</Button>
            <Button variant="ghost" onClick={() => { setBackBy(''); }}>No back-by time</Button>
          </div>
        </form>
      </Sheet>
    </Section>
  )
}
