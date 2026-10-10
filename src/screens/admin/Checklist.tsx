import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Button, Spinner } from '../../components/Button'
import { Card } from '../../components/Card'
import { TextInput } from '../../components/Input'
import { Note } from '../../components/Note'
import { Screen } from '../../components/Screen'
import { Sheet } from '../../components/Sheet'
import type { ChecklistItemRow } from '../../lib/database.types'
import { friendlyError } from '../../lib/errors'
import { supabase } from '../../lib/supabase'

/** Admin: the "before you leave" list. Add, rename, reorder, remove. */
export function Checklist() {
  const [items, setItems] = useState<ChecklistItemRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<ChecklistItemRow | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('checklist_items').select('*').is('deleted_at', null).order('sort_order').order('created_at')
    if (error) setError(friendlyError(error))
    else setItems(data ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function add(e: FormEvent) {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title || !items) return
    setBusy(true)
    const next = (items.at(-1)?.sort_order ?? 0) + 1
    const { error } = await supabase.from('checklist_items').insert({ title, sort_order: next })
    setBusy(false)
    if (error) return setError(friendlyError(error))
    setNewTitle('')
    await load()
  }

  async function move(index: number, dir: -1 | 1) {
    if (!items) return
    const a = items[index]
    const b = items[index + dir]
    if (!a || !b) return
    // Make sure the two have distinct orders, then swap.
    const orderA = a.sort_order === b.sort_order ? b.sort_order + dir : b.sort_order
    const orderB = a.sort_order === b.sort_order ? a.sort_order : a.sort_order
    const [r1, r2] = await Promise.all([
      supabase.from('checklist_items').update({ sort_order: orderA }).eq('id', a.id),
      supabase.from('checklist_items').update({ sort_order: orderB }).eq('id', b.id),
    ])
    if (r1.error || r2.error) setError(friendlyError(r1.error ?? r2.error))
    await load()
  }

  return (
    <Screen title="Check-out list" back="/more">
      {error && <Note kind="error" className="mb-4">{error}</Note>}
      <p className="mb-4 text-sm text-ink-muted">What everyone ticks off before they leave the place. Top to bottom is the order they'll see.</p>

      <Card title="Add a step" className="mb-4">
        <form onSubmit={add} className="flex gap-2">
          <div className="flex-1">
            <TextInput name="newTitle" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Lock the front gate" maxLength={200} autoComplete="off" enterKeyHint="done" />
          </div>
          <Button type="submit" busy={busy} disabled={!newTitle.trim()}>Add</Button>
        </form>
      </Card>

      {!items ? (
        <div className="flex justify-center py-8 text-pine-900"><Spinner /></div>
      ) : items.length === 0 ? (
        <Note>Nothing on the list yet.</Note>
      ) : (
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li key={it.id} className="flex items-center gap-1 rounded-2xl bg-white pr-1 ring-1 ring-tan-200">
              <button type="button" onClick={() => setEditing(it)} className="tap flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left active:bg-tan-100">
                <span className="w-6 shrink-0 text-sm font-bold text-tan-700">{i + 1}.</span>
                <span className="truncate font-semibold text-ink">{it.title}</span>
              </button>
              <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="tap rounded-lg text-pine-900 disabled:opacity-25 active:bg-tan-100">
                <Chev up />
              </button>
              <button type="button" aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)} className="tap rounded-lg text-pine-900 disabled:opacity-25 active:bg-tan-100">
                <Chev />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title="Edit step">
        {editing && <EditItem key={editing.id} item={editing} onDone={async () => { setEditing(null); await load() }} />}
      </Sheet>
    </Screen>
  )
}

function EditItem({ item, onDone }: { item: ChecklistItemRow; onDone: () => Promise<void> }) {
  const [title, setTitle] = useState(item.title)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(patch: { title?: string; deleted_at?: string }) {
    setBusy(true)
    const { error } = await supabase.from('checklist_items').update(patch).eq('id', item.id)
    setBusy(false)
    if (error) return setError(friendlyError(error))
    await onDone()
  }

  return (
    <div className="space-y-4">
      {error && <Note kind="error">{error}</Note>}
      <form onSubmit={(e) => { e.preventDefault(); void save({ title: title.trim() }) }} className="flex gap-2">
        <div className="flex-1">
          <TextInput label="Step" name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </div>
        <div className="self-end">
          <Button type="submit" busy={busy} disabled={!title.trim() || title.trim() === item.title}>Save</Button>
        </div>
      </form>
      <Button variant="danger" busy={busy} onClick={() => void save({ deleted_at: new Date().toISOString() })}>Remove from list</Button>
    </div>
  )
}

function Chev({ up }: { up?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d={up ? 'M4 13l6-6 6 6' : 'M4 7l6 6 6-6'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
