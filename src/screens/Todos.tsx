import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { Button, Spinner } from '../components/Button'
import { TextArea, TextInput } from '../components/Input'
import { Note } from '../components/Note'
import { PinSelect, type Where } from '../components/PinSelect'
import { Screen } from '../components/Screen'
import { Sheet } from '../components/Sheet'
import type { PinRow, TodoRow } from '../lib/database.types'
import { fmtDate, fmtDateTime, todayISO } from '../lib/dates'
import { friendlyError } from '../lib/errors'
import { useMembers } from '../lib/members'
import { loadPins } from '../lib/pins'
import { useRealtime } from '../lib/realtime'
import { useMe } from '../lib/session'
import { supabase } from '../lib/supabase'
import { createRow } from '../lib/outbox'
import { Comments } from './Log'

type Filter = 'mine' | 'open' | 'done'

export async function loadMyOpenTodos(memberId: string, limit = 5): Promise<TodoRow[]> {
  const { data, error } = await supabase.from('todos').select('*').is('deleted_at', null).eq('status', 'open').eq('assignee_id', memberId).order('due_on', { ascending: true }).limit(limit)
  if (error) throw error
  return data ?? []
}

export function Todos() {
  const me = useMe()
  const { nameOf } = useMembers()
  const [params, setParams] = useSearchParams()
  const [rows, setRows] = useState<TodoRow[] | null>(null)
  const [pins, setPins] = useState<PinRow[]>([])
  const [filter, setFilter] = useState<Filter>('open')
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<TodoRow | 'new' | null>(params.get('new') ? 'new' : null)
  const [open, setOpen] = useState<TodoRow | null>(null)

  const reload = useCallback(async () => {
    try {
      const [{ data, error }, allPins] = await Promise.all([
        supabase.from('todos').select('*').is('deleted_at', null).order('status').order('due_on', { ascending: true }).order('created_at', { ascending: false }).limit(300),
        loadPins(),
      ])
      if (error) throw error
      setRows(data ?? [])
      setPins(allPins)
      setOpen((cur) => (cur ? ((data ?? []).find((t) => t.id === cur.id) ?? null) : null))
    } catch (err) {
      setError(friendlyError(err))
    }
  }, [])
  useEffect(() => { void reload() }, [reload])
  useRealtime(['todos', 'comments'], reload)

  const shown = useMemo(() => {
    const all = rows ?? []
    if (filter === 'mine') return all.filter((t) => t.status === 'open' && t.assignee_id === me.member_id)
    if (filter === 'done') return all.filter((t) => t.status === 'done').sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
    return all.filter((t) => t.status === 'open')
  }, [rows, filter, me.member_id])

  async function toggle(t: TodoRow) {
    const done = t.status === 'open'
    const { error } = await supabase.from('todos').update(done ? { status: 'done', completed_by: me.member_id, completed_at: new Date().toISOString() } : { status: 'open', completed_by: null, completed_at: null }).eq('id', t.id)
    if (error) return setError(friendlyError(error))
    await reload()
  }

  async function remove(t: TodoRow) {
    const { error } = await supabase.from('todos').update({ deleted_at: new Date().toISOString() }).eq('id', t.id)
    if (error) return setError(friendlyError(error))
    setOpen(null); await reload()
  }

  const pinName = (id: string | null) => pins.find((p) => p.id === id)?.name
  const today = todayISO()

  return (
    <Screen
      title="To-dos"
      back="/more"
      right={
        <button type="button" onClick={() => setEditing('new')} className="tap flex items-center gap-1 rounded-lg px-3 font-semibold active:bg-clay-800">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
          Add
        </button>
      }
    >
      {error && <Note kind="error" className="mb-3">{error}</Note>}
      <div className="mb-3 flex gap-2">
        {([['mine', 'Mine'], ['open', 'All open'], ['done', 'Done']] as const).map(([f, label]) => (
          <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f} className={`tap rounded-full px-4 py-1.5 text-sm font-bold ring-1 ${filter === f ? 'bg-clay-900 text-cream ring-clay-900' : 'bg-white text-clay-950 ring-tan-500'}`}>
            {label}
          </button>
        ))}
      </div>

      {!rows ? (
        <div className="flex justify-center py-8 text-clay-900"><Spinner /></div>
      ) : shown.length === 0 ? (
        <Note>{filter === 'mine' ? 'Nothing assigned to you. Nice.' : filter === 'done' ? 'Nothing finished yet.' : 'Nothing open.'}</Note>
      ) : (
        <ul className="space-y-2">
          {shown.map((t) => {
            const overdue = t.status === 'open' && t.due_on && t.due_on < today
            return (
              <li key={t.id} className="flex items-stretch gap-2 rounded-2xl bg-white ring-1 ring-tan-200">
                <button type="button" onClick={() => toggle(t)} aria-label={t.status === 'open' ? `Mark ${t.title} done` : `Reopen ${t.title}`} className="tap flex w-12 shrink-0 items-center justify-center">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full border-2 ${t.status === 'done' ? 'border-clay-900 bg-clay-900 text-cream' : 'border-tan-600 bg-white'}`}>
                    {t.status === 'done' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>}
                  </span>
                </button>
                <button type="button" onClick={() => setOpen(t)} className="tap min-w-0 flex-1 py-3 pr-3 text-left">
                  <div className={`font-semibold ${t.status === 'done' ? 'text-ink-muted line-through' : 'text-clay-950'}`}>{t.title}</div>
                  <div className="text-sm text-ink-muted">
                    {t.assignee_id ? nameOf(t.assignee_id) : 'Anyone'}
                    {t.due_on && <span className={overdue ? ' font-semibold text-alert' : ''}> · {overdue ? 'was due' : 'due'} {fmtDate(t.due_on)}</span>}
                    {pinName(t.pin_id) && ` · ${pinName(t.pin_id)}`}
                    {t.status === 'done' && t.completed_at && ` · done by ${nameOf(t.completed_by)} ${fmtDate(t.completed_at.slice(0, 10))}`}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <Sheet open={open !== null} onClose={() => setOpen(null)} title={open?.title}>
        {open && (
          <div className="space-y-3">
            <p className="text-sm text-ink">
              {open.assignee_id ? `Assigned to ${nameOf(open.assignee_id)}` : 'Not assigned to anyone'}
              {open.due_on && ` · due ${fmtDate(open.due_on)}`}
              {pinName(open.pin_id) && ` · ${pinName(open.pin_id)}`}
              <br />Added by {nameOf(open.created_by)} {fmtDateTime(open.created_at)}
              {open.status === 'done' && open.completed_at && <><br />Done by {nameOf(open.completed_by)} {fmtDateTime(open.completed_at)}</>}
            </p>
            {open.notes && <p className="whitespace-pre-wrap text-ink">{open.notes}</p>}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => toggle(open)}>{open.status === 'open' ? 'Mark done' : 'Reopen'}</Button>
              <Button variant="secondary" onClick={() => { setEditing(open); setOpen(null) }}>Edit</Button>
              {(open.created_by === me.member_id || me.is_admin) && <Button variant="ghost" onClick={() => remove(open)}>Remove</Button>}
            </div>
            <Comments parentType="todo" parentId={open.id} />
          </div>
        )}
      </Sheet>

      <Sheet open={editing !== null} onClose={() => { setEditing(null); if (params.get('new')) setParams({}, { replace: true }) }} title={editing === 'new' ? 'New to-do' : 'Edit to-do'}>
        {editing && (
          <TodoForm
            key={editing === 'new' ? 'new' : editing.id}
            todo={editing === 'new' ? null : editing}
            initialTitle={params.get('title') ?? ''}
            initialPin={params.get('pin')}
            onDone={async () => { setEditing(null); setParams({}, { replace: true }); await reload() }}
          />
        )}
      </Sheet>
    </Screen>
  )
}

function TodoForm({ todo, initialTitle, initialPin, onDone }: { todo: TodoRow | null; initialTitle: string; initialPin: string | null; onDone: () => Promise<void> }) {
  const me = useMe()
  const { active } = useMembers()
  const [title, setTitle] = useState(todo?.title ?? initialTitle)
  const [notes, setNotes] = useState(todo?.notes ?? '')
  const [assignee, setAssignee] = useState(todo?.assignee_id ?? '')
  const [due, setDue] = useState(todo?.due_on ?? '')
  const [where, setWhere] = useState<Where>({ pin_id: todo?.pin_id ?? initialPin ?? null, lat: null, lng: null })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const row = { title: title.trim(), notes: notes.trim() || null, assignee_id: assignee || null, due_on: due || null, pin_id: where.pin_id }
    try {
      if (todo) {
        const { error } = await supabase.from('todos').update(row).eq('id', todo.id)
        if (error) throw error
      } else {
        await createRow('todos', row)
      }
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
      <TextInput label="What needs doing" name="todoTitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Fix the north fence" maxLength={200} autoFocus={!todo} />
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-clay-900">Who</span>
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="tap w-full rounded-xl border border-tan-500 bg-white px-3 py-3 text-ink">
            <option value="">Anyone</option>
            {active.map((m) => <option key={m.id} value={m.id}>{m.id === me.member_id ? `${m.name} (me)` : m.name}</option>)}
          </select>
        </label>
        <TextInput label="Due (optional)" name="todoDue" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </div>
      <PinSelect value={where} onChange={setWhere} />
      <TextArea label="Notes" name="todoNotes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" rows={2} />
      <Button type="submit" full busy={busy} disabled={!title.trim()}>{todo ? 'Save' : 'Add to-do'}</Button>
    </form>
  )
}
