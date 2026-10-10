import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button, Spinner } from '../components/Button'
import { Card } from '../components/Card'
import { TextArea, TextInput } from '../components/Input'
import { Note } from '../components/Note'
import { PinSelect, type Where } from '../components/PinSelect'
import { Screen } from '../components/Screen'
import { Sheet } from '../components/Sheet'
import type { CommentRow, LogEntryRow, PinRow } from '../lib/database.types'
import { fmtDateTime } from '../lib/dates'
import { friendlyError } from '../lib/errors'
import { useMembers } from '../lib/members'
import { fmtCoords, loadPins } from '../lib/pins'
import { useRealtime } from '../lib/realtime'
import { useMe } from '../lib/session'
import { supabase } from '../lib/supabase'

export async function loadLog(limit = 100): Promise<LogEntryRow[]> {
  const { data, error } = await supabase.from('log_entries').select('*').is('deleted_at', null).order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return data ?? []
}

/** The running "what happened" feed. Compose at the top, comments on each entry. */
export function Log() {
  const me = useMe()
  const navigate = useNavigate()
  const { nameOf } = useMembers()
  const [rows, setRows] = useState<LogEntryRow[] | null>(null)
  const [counts, setCounts] = useState<Map<string, number>>(new Map())
  const [pins, setPins] = useState<PinRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [where, setWhere] = useState<Where>({ pin_id: null, lat: null, lng: null })
  const [showWhere, setShowWhere] = useState(false)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<LogEntryRow | null>(null)

  const reload = useCallback(async () => {
    try {
      const [entries, allPins, { data: cm }] = await Promise.all([
        loadLog(),
        loadPins(),
        supabase.from('comments').select('parent_id').eq('parent_type', 'log_entry').is('deleted_at', null),
      ])
      setRows(entries)
      setPins(allPins)
      const m = new Map<string, number>()
      for (const c of cm ?? []) m.set(c.parent_id, (m.get(c.parent_id) ?? 0) + 1)
      setCounts(m)
      setOpen((cur) => (cur ? (entries.find((e) => e.id === cur.id) ?? null) : null))
    } catch (err) {
      setError(friendlyError(err))
    }
  }, [])
  useEffect(() => { void reload() }, [reload])
  useRealtime(['log_entries', 'comments'], reload)

  async function post(e: FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setBusy(true); setError(null)
    const { error } = await supabase.from('log_entries').insert({ body: body.trim(), pin_id: where.pin_id, lat: where.lat, lng: where.lng })
    setBusy(false)
    if (error) return setError(friendlyError(error))
    setBody(''); setWhere({ pin_id: null, lat: null, lng: null }); setShowWhere(false)
    await reload()
  }

  async function remove(row: LogEntryRow) {
    const { error } = await supabase.from('log_entries').update({ deleted_at: new Date().toISOString() }).eq('id', row.id)
    if (error) return setError(friendlyError(error))
    setOpen(null); await reload()
  }

  const pinName = (id: string | null) => pins.find((p) => p.id === id)?.name

  return (
    <Screen title="Log" back="/more">
      {error && <Note kind="error" className="mb-3">{error}</Note>}
      <Card className="mb-4">
        <form onSubmit={post} className="space-y-2">
          <TextArea name="logBody" value={body} onChange={(e) => setBody(e.target.value)} placeholder="What happened? Fence down by the north gate, creek crossing washed out…" rows={2} maxLength={4000} />
          {showWhere ? <PinSelect value={where} onChange={setWhere} /> : null}
          <div className="flex items-center gap-2">
            <Button type="submit" busy={busy} disabled={!body.trim()}>Post</Button>
            {!showWhere && <Button variant="ghost" onClick={() => setShowWhere(true)}>Add a spot</Button>}
          </div>
        </form>
      </Card>

      {!rows ? (
        <div className="flex justify-center py-8 text-clay-900"><Spinner /></div>
      ) : rows.length === 0 ? (
        <Note>Nothing in the log yet.</Note>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setOpen(r)} className="tap w-full rounded-2xl bg-white p-4 text-left ring-1 ring-tan-200 active:bg-tan-100">
                <p className="whitespace-pre-wrap text-ink">{r.body}</p>
                <p className="mt-1 text-sm text-ink-muted">
                  {nameOf(r.created_by)} · {fmtDateTime(r.created_at)}
                  {pinName(r.pin_id) ? ` · ${pinName(r.pin_id)}` : r.lat != null ? ' · GPS spot' : ''}
                  {(counts.get(r.id) ?? 0) > 0 ? ` · ${counts.get(r.id)} comment${counts.get(r.id)! > 1 ? 's' : ''}` : ''}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={open !== null} onClose={() => setOpen(null)} title="Log entry">
        {open && (
          <div className="space-y-3">
            <p className="whitespace-pre-wrap text-ink">{open.body}</p>
            <p className="text-sm text-ink-muted">
              {nameOf(open.created_by)} · {fmtDateTime(open.created_at)}
              {pinName(open.pin_id) ? ` · ${pinName(open.pin_id)}` : open.lat != null ? ` · ${fmtCoords(open.lat, open.lng!)}` : ''}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => navigate(`/todos/new?title=${encodeURIComponent(open.body.slice(0, 80))}${open.pin_id ? `&pin=${open.pin_id}` : ''}`)}>Make a to-do</Button>
              {(open.created_by === me.member_id || me.is_admin) && <Button variant="ghost" onClick={() => remove(open)}>Remove</Button>}
            </div>
            <Comments parentType="log_entry" parentId={open.id} />
          </div>
        )}
      </Sheet>
    </Screen>
  )
}

/** Comment thread on any entry. */
export function Comments({ parentType, parentId }: { parentType: CommentRow['parent_type']; parentId: string }) {
  const me = useMe()
  const { nameOf } = useMembers()
  const [list, setList] = useState<CommentRow[] | null>(null)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    const { data } = await supabase.from('comments').select('*').eq('parent_type', parentType).eq('parent_id', parentId).is('deleted_at', null).order('created_at')
    setList(data ?? [])
  }, [parentType, parentId])
  useEffect(() => { void reload() }, [reload])
  useRealtime(['comments'], reload)

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setBusy(true)
    await supabase.from('comments').insert({ parent_type: parentType, parent_id: parentId, body: body.trim() })
    setBusy(false); setBody('')
    await reload()
  }

  async function remove(c: CommentRow) {
    await supabase.from('comments').update({ deleted_at: new Date().toISOString() }).eq('id', c.id)
    await reload()
  }

  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-tan-200">
      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-clay-800">Comments</div>
      {!list ? <Spinner small /> : list.length === 0 ? <p className="text-sm text-ink-muted">No comments yet.</p> : (
        <ul className="space-y-2">
          {list.map((c) => (
            <li key={c.id} className="text-sm">
              <span className="font-semibold text-clay-950">{nameOf(c.created_by)}</span>
              <span className="text-ink-muted"> · {fmtDateTime(c.created_at)}</span>
              {(c.created_by === me.member_id || me.is_admin) && <button type="button" onClick={() => remove(c)} className="ml-2 text-xs text-ink-muted underline">remove</button>}
              <p className="whitespace-pre-wrap text-ink">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="mt-2 flex gap-2">
        <div className="flex-1"><TextInput name="commentBody" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment" maxLength={2000} /></div>
        <Button type="submit" busy={busy} disabled={!body.trim()}>Send</Button>
      </form>
    </div>
  )
}
