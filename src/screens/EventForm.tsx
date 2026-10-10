import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { Button } from '../components/Button'
import { TextArea, TextInput } from '../components/Input'
import { Note } from '../components/Note'
import { Screen } from '../components/Screen'
import { Sheet } from '../components/Sheet'
import type { EventKind, EventRow } from '../lib/database.types'
import { fmtRange, todayISO } from '../lib/dates'
import { friendlyError } from '../lib/errors'
import { exclusiveOverlapping, KIND, KIND_ORDER } from '../lib/events'
import { useMembers } from '../lib/members'
import { useMe } from '../lib/session'
import { supabase } from '../lib/supabase'

/** New event, or edit an existing one (owner or admin). */
export function EventForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const me = useMe()
  const { nameOf } = useMembers()

  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<EventKind>('inclusive')
  const [start, setStart] = useState(params.get('date') ?? todayISO())
  const [end, setEnd] = useState(params.get('date') ?? todayISO())
  const [notes, setNotes] = useState('')
  const [going, setGoing] = useState(true)
  const [loaded, setLoaded] = useState(!id)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warn, setWarn] = useState<EventRow[] | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!id) return
    supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) return setError(friendlyError(error))
        setTitle(data.title)
        setKind(data.kind)
        setStart(data.starts_on)
        setEnd(data.ends_on)
        setNotes(data.notes ?? '')
        setLoaded(true)
      })
  }, [id])

  const endBeforeStart = end < start

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (endBeforeStart) return
    setBusy(true)
    setError(null)
    try {
      if (kind !== 'exclusive') {
        const clashes = await exclusiveOverlapping(start, end, id)
        if (clashes.length) {
          setWarn(clashes)
          setBusy(false)
          return
        }
      }
      await save()
    } catch (err) {
      setError(friendlyError(err))
      setBusy(false)
    }
  }

  async function save() {
    setBusy(true)
    try {
      const row = { title: title.trim(), kind, starts_on: start, ends_on: end, notes: notes.trim() || null }
      if (id) {
        const { error } = await supabase.from('events').update(row).eq('id', id)
        if (error) throw error
        navigate(`/calendar/${id}`, { replace: true })
      } else {
        const { data, error } = await supabase.from('events').insert(row).select('id').single()
        if (error) throw error
        if (going && kind !== 'info' && me.member_id) {
          await supabase.from('event_attendees').insert({ event_id: data.id, member_id: me.member_id })
        }
        navigate(`/calendar/${data.id}`, { replace: true })
      }
    } catch (err) {
      setError(friendlyError(err))
      setWarn(null)
      setBusy(false)
    }
  }

  async function remove() {
    if (!id) return
    setBusy(true)
    const { error } = await supabase.from('events').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) {
      setError(friendlyError(error))
      setBusy(false)
      return
    }
    navigate('/calendar', { replace: true })
  }

  return (
    <Screen title={id ? 'Edit' : 'Add to the calendar'} back={id ? `/calendar/${id}` : '/calendar'}>
      {error && <Note kind="error" className="mb-3">{error}</Note>}
      {loaded && (
        <form onSubmit={submit} className="space-y-4">
          <TextInput
            label="What"
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Opening weekend, work day, Mike's trip…"
            maxLength={120}
            autoFocus={!id}
          />

          <fieldset>
            <legend className="mb-1 block text-sm font-semibold text-clay-900">Who's it for</legend>
            <div className="grid grid-cols-3 gap-2">
              {KIND_ORDER.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  aria-pressed={kind === k}
                  className={`tap rounded-xl px-2 py-3 text-sm font-bold ring-1 ${
                    kind === k ? 'bg-clay-900 text-cream ring-clay-900' : 'bg-white text-clay-950 ring-tan-500'
                  }`}
                >
                  {k === 'exclusive' ? 'Just us' : KIND[k].label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-sm text-ink-muted">
              {kind === 'exclusive' ? 'You have the place to yourselves. Nobody else can mark these dates "just us".' : KIND[kind].help}
            </p>
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <TextInput
              label="From"
              name="start"
              type="date"
              value={start}
              onChange={(e) => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value) }}
              required
            />
            <TextInput
              label="To"
              name="end"
              type="date"
              value={end}
              min={start}
              onChange={(e) => setEnd(e.target.value)}
              error={endBeforeStart ? 'Before the start.' : null}
              required
            />
          </div>

          <TextArea label="Notes" name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional. Potluck Saturday, bring a chainsaw…" />

          {!id && kind !== 'info' && (
            <label className="tap flex items-center gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-tan-200">
              <input type="checkbox" checked={going} onChange={(e) => setGoing(e.target.checked)} className="h-6 w-6 accent-clay-900" />
              <span className="font-semibold text-clay-950">I'm going</span>
            </label>
          )}

          <Button type="submit" full busy={busy} disabled={!title.trim() || endBeforeStart}>
            {id ? 'Save' : 'Add it'}
          </Button>

          {id && (
            <div className="pt-4">
              {confirmDelete ? (
                <div className="space-y-2 rounded-xl bg-alert/10 p-3">
                  <p className="text-sm text-alert">Remove this from the calendar?</p>
                  <div className="flex gap-2">
                    <Button variant="danger" busy={busy} onClick={remove}>Yes, remove it</Button>
                    <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Keep it</Button>
                  </div>
                </div>
              ) : (
                <Button variant="ghost" full onClick={() => setConfirmDelete(true)}>Remove from calendar</Button>
              )}
            </div>
          )}
        </form>
      )}

      <Sheet open={warn !== null} onClose={() => setWarn(null)} title="Someone else has these dates">
        <ul className="mb-4 space-y-2">
          {(warn ?? []).map((e) => (
            <li key={e.id} className="rounded-xl bg-tan-100 px-4 py-3">
              <div className="font-bold text-clay-950">{nameOf(e.created_by)} has the place</div>
              <div className="text-sm text-ink">{fmtRange(e.starts_on, e.ends_on)} · {e.title}</div>
            </li>
          ))}
        </ul>
        <p className="mb-4 text-sm text-ink-muted">You can still add yours. Maybe check with them first.</p>
        <div className="space-y-2">
          <Button full busy={busy} onClick={save}>Add it anyway</Button>
          <Button variant="ghost" full onClick={() => setWarn(null)}>Change the dates</Button>
        </div>
      </Sheet>
    </Screen>
  )
}
