import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Button, Spinner } from '../components/Button'
import { Card, Divider } from '../components/Card'
import { KindBadge } from '../components/EventListRow'
import { TextInput } from '../components/Input'
import { Note } from '../components/Note'
import { Screen } from '../components/Screen'
import { Sheet } from '../components/Sheet'
import type { EventAttendeeRow, EventRow } from '../lib/database.types'
import { fmtRange, relativeDay, todayISO } from '../lib/dates'
import { friendlyError } from '../lib/errors'
import { KIND } from '../lib/events'
import { useMembers } from '../lib/members'
import { useRealtime } from '../lib/realtime'
import { useMe } from '../lib/session'
import { useSettings } from '../lib/settings'
import { supabase } from '../lib/supabase'

export function EventDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const me = useMe()
  const { nameOf } = useMembers()
  const [event, setEvent] = useState<EventRow | null>(null)
  const [attendees, setAttendees] = useState<EventAttendeeRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState('')
  const [count, setCount] = useState(1)
  const [busy, setBusy] = useState(false)
  const { values: settings } = useSettings()
  const beds = Number(settings?.beds ?? 4)

  const reload = useCallback(async () => {
    const [{ data: ev, error: e1 }, { data: at }] = await Promise.all([
      supabase.from('events').select('*').eq('id', id).single(),
      supabase.from('event_attendees').select('*').eq('event_id', id).order('created_at'),
    ])
    if (e1 || !ev) return setError('That entry is gone.')
    setEvent(ev)
    setAttendees(at ?? [])
  }, [id])

  useEffect(() => {
    void reload()
  }, [reload])
  useRealtime(['events', 'event_attendees'], reload)

  const mine = attendees.find((a) => a.member_id === me.member_id)
  const canEdit = event && (event.created_by === me.member_id || me.is_admin)
  const isHost = event?.created_by === me.member_id

  async function join(e: FormEvent) {
    e.preventDefault()
    if (!me.member_id) return
    setBusy(true)
    const row = { event_id: id, member_id: me.member_id, note: note.trim() || null, headcount: count }
    const { error } = mine
      ? await supabase.from('event_attendees').update({ note: row.note, headcount: count }).eq('event_id', id).eq('member_id', me.member_id)
      : await supabase.from('event_attendees').insert(row)
    setBusy(false)
    if (error) return setError(friendlyError(error))
    setNoteOpen(false)
    await reload()
  }

  async function leave() {
    if (!me.member_id) return
    setBusy(true)
    const { error } = await supabase.from('event_attendees').delete().eq('event_id', id).eq('member_id', me.member_id)
    setBusy(false)
    if (error) return setError(friendlyError(error))
    await reload()
  }

  if (error && !event) {
    return (
      <Screen title="Calendar" back="/calendar">
        <Note kind="error">{error}</Note>
      </Screen>
    )
  }
  if (!event) {
    return (
      <Screen title="Calendar" back="/calendar">
        <div className="flex justify-center py-8 text-clay-900"><Spinner /></div>
      </Screen>
    )
  }

  const today = todayISO()
  const live = event.starts_on <= today && event.ends_on >= today
  const past = event.ends_on < today
  const people = attendees.reduce((n, a) => n + (a.headcount ?? 1), 0)

  return (
    <Screen
      title={event.title}
      back="/calendar"
      right={
        canEdit ? (
          <button type="button" onClick={() => navigate(`/calendar/${id}/edit`)} className="tap rounded-lg px-3 font-semibold active:bg-clay-800">
            Edit
          </button>
        ) : undefined
      }
    >
      {error && <Note kind="error" className="mb-3">{error}</Note>}
      <Card className="mb-4">
        <div className="mb-2 flex items-center gap-2">
          <KindBadge kind={event.kind} mine={isHost} />
          <span className="text-sm text-ink-muted">{live ? 'Happening now' : past ? 'Past' : relativeDay(event.starts_on)}</span>
        </div>
        <p className="text-xl font-bold text-clay-950">{fmtRange(event.starts_on, event.ends_on)}</p>
        <p className="mt-1 text-sm text-ink-muted">
          {event.kind === 'exclusive'
            ? `${isHost ? 'You have' : nameOf(event.created_by) + ' has'} the place these dates.`
            : `Added by ${nameOf(event.created_by)}. ${KIND[event.kind].help}`}
        </p>
        {event.notes && <p className="mt-3 whitespace-pre-wrap text-ink">{event.notes}</p>}
      </Card>

      {event.kind !== 'info' && (
        <Card title={`Who's going (${attendees.length})`}>
          {attendees.length === 0 ? <p className="text-sm text-ink-muted">Nobody has said yet.</p> : (
            <p className={`mb-1 text-sm ${people > beds ? 'font-semibold text-alert' : 'text-ink-muted'}`}>
              {people} {people === 1 ? 'person' : 'people'}, {beds} beds{people > beds ? '. Somebody is bringing a cot.' : '.'}
            </p>
          )}
          {attendees.map((a, i) => (
            <div key={a.member_id}>
              {i > 0 && <Divider />}
              <div className="py-2">
                <div className="font-semibold text-clay-950">
                  {nameOf(a.member_id)}
                  {(a.headcount ?? 1) > 1 && <span className="ml-1 text-sm font-medium text-ink">+{a.headcount - 1}</span>}
                  {a.member_id === me.member_id && <span className="ml-2 text-xs font-medium text-ink-muted">you</span>}
                </div>
                {a.note && <div className="text-sm text-ink-muted">{a.note}</div>}
              </div>
            </div>
          ))}
          {!past && (
            <div className="mt-3 flex flex-wrap gap-2">
              {mine ? (
                <>
                  <Button variant="secondary" onClick={() => { setNote(mine.note ?? ''); setCount(mine.headcount ?? 1); setNoteOpen(true) }}>
                    Change my note or headcount
                  </Button>
                  <Button variant="ghost" busy={busy} onClick={leave}>I'm out</Button>
                </>
              ) : (
                <Button onClick={() => { setNote(''); setCount(1); setNoteOpen(true) }}>I'm in</Button>
              )}
            </div>
          )}
        </Card>
      )}

      <Sheet open={noteOpen} onClose={() => setNoteOpen(false)} title={mine ? 'Your plans' : "I'm in"}>
        <form onSubmit={join} className="space-y-3">
          <div>
            <span className="mb-1 block text-sm font-semibold text-clay-900">How many of us</span>
            <div className="flex items-center gap-3">
              <Button type="button" variant="secondary" className="!px-4" aria-label="Fewer" onClick={() => setCount((c) => Math.max(1, c - 1))}>−</Button>
              <span className="w-8 text-center text-xl font-extrabold text-clay-950" aria-live="polite">{count}</span>
              <Button type="button" variant="secondary" className="!px-4" aria-label="More" onClick={() => setCount((c) => Math.min(30, c + 1))}>+</Button>
              <span className="text-sm text-ink-muted">counting you</span>
            </div>
          </div>
          <TextInput
            label="Note (optional)"
            name="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Bringing my nephew, Saturday only…"
            maxLength={200}
            autoFocus
          />
          <Button type="submit" full busy={busy}>{mine ? 'Save' : "Count me in"}</Button>
        </form>
      </Sheet>
    </Screen>
  )
}
