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
  const [busy, setBusy] = useState(false)

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
    const row = { event_id: id, member_id: me.member_id, note: note.trim() || null }
    const { error } = mine
      ? await supabase.from('event_attendees').update({ note: row.note }).eq('event_id', id).eq('member_id', me.member_id)
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
        <div className="flex justify-center py-8 text-pine-900"><Spinner /></div>
      </Screen>
    )
  }

  const today = todayISO()
  const live = event.starts_on <= today && event.ends_on >= today
  const past = event.ends_on < today

  return (
    <Screen
      title={event.title}
      back="/calendar"
      right={
        canEdit ? (
          <button type="button" onClick={() => navigate(`/calendar/${id}/edit`)} className="tap rounded-lg px-3 font-semibold active:bg-pine-800">
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
        <p className="text-xl font-bold text-pine-950">{fmtRange(event.starts_on, event.ends_on)}</p>
        <p className="mt-1 text-sm text-ink-muted">
          {event.kind === 'exclusive'
            ? `${isHost ? 'You have' : nameOf(event.created_by) + ' has'} the place these dates.`
            : `Added by ${nameOf(event.created_by)}. ${KIND[event.kind].help}`}
        </p>
        {event.notes && <p className="mt-3 whitespace-pre-wrap text-ink">{event.notes}</p>}
      </Card>

      {event.kind !== 'info' && (
        <Card title={`Who's going (${attendees.length})`}>
          {attendees.length === 0 && <p className="text-sm text-ink-muted">Nobody has said yet.</p>}
          {attendees.map((a, i) => (
            <div key={a.member_id}>
              {i > 0 && <Divider />}
              <div className="py-2">
                <div className="font-semibold text-pine-950">
                  {nameOf(a.member_id)}
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
                  <Button variant="secondary" onClick={() => { setNote(mine.note ?? ''); setNoteOpen(true) }}>
                    {mine.note ? 'Change my note' : 'Add a note'}
                  </Button>
                  <Button variant="ghost" busy={busy} onClick={leave}>I'm out</Button>
                </>
              ) : (
                <Button onClick={() => { setNote(''); setNoteOpen(true) }}>I'm in</Button>
              )}
            </div>
          )}
        </Card>
      )}

      <Sheet open={noteOpen} onClose={() => setNoteOpen(false)} title={mine ? 'Your note' : "I'm in"}>
        <form onSubmit={join} className="space-y-3">
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
