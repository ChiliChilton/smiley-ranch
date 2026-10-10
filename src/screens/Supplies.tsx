import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Button, Spinner } from '../components/Button'
import { Card, Divider } from '../components/Card'
import { TextInput } from '../components/Input'
import { Note } from '../components/Note'
import { Screen } from '../components/Screen'
import { Sheet } from '../components/Sheet'
import type { SupplyItemRow, SupplyLevel } from '../lib/database.types'
import { fmtDate } from '../lib/dates'
import { friendlyError } from '../lib/errors'
import { useMembers } from '../lib/members'
import { useRealtime } from '../lib/realtime'
import { useMe } from '../lib/session'
import { supabase } from '../lib/supabase'

const LEVELS: { value: SupplyLevel; label: string; cls: string }[] = [
  { value: 'full', label: 'Full', cls: 'bg-sage-100 text-sage-900 ring-sage-600' },
  { value: 'some', label: 'Some', cls: 'bg-clay-100 text-clay-900 ring-clay-600' },
  { value: 'low', label: 'Low', cls: 'bg-warn/20 text-tan-700 ring-warn' },
  { value: 'out', label: 'Out', cls: 'bg-alert/10 text-alert ring-alert' },
]

export async function loadSupplies(): Promise<SupplyItemRow[]> {
  const { data, error } = await supabase.from('supply_items').select('*').is('deleted_at', null).order('name')
  if (error) throw error
  return data ?? []
}

/** Shopping list ("we need") plus a rough inventory. Low or out puts an item on the list automatically. */
export function Supplies() {
  const me = useMe()
  const { nameOf } = useMembers()
  const [items, setItems] = useState<SupplyItemRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newNeed, setNewNeed] = useState('')
  const [newInv, setNewInv] = useState('')
  const [busy, setBusy] = useState(false)
  const [showGot, setShowGot] = useState(false)
  const [editing, setEditing] = useState<SupplyItemRow | null>(null)

  const reload = useCallback(async () => {
    try { setItems(await loadSupplies()) } catch (err) { setError(friendlyError(err)) }
  }, [])
  useEffect(() => { void reload() }, [reload])
  useRealtime(['supply_items'], reload)

  const needed = useMemo(() => (items ?? []).filter((i) => i.needed), [items])
  const inventory = useMemo(() => (items ?? []).filter((i) => i.is_inventory), [items])
  const got = useMemo(() => (items ?? []).filter((i) => !i.needed && !i.is_inventory && i.got_at).sort((a, b) => (b.got_at ?? '').localeCompare(a.got_at ?? '')).slice(0, 15), [items])

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true); setError(null)
    const { error } = await fn()
    setBusy(false)
    if (error) return setError(friendlyError(error))
    await reload()
  }

  const addNeed = (e: FormEvent) => { e.preventDefault(); const name = newNeed.trim(); if (!name) return; setNewNeed(''); void run(() => supabase.from('supply_items').insert({ name, needed: true })) }
  const addInv = (e: FormEvent) => { e.preventDefault(); const name = newInv.trim(); if (!name) return; setNewInv(''); void run(() => supabase.from('supply_items').insert({ name, is_inventory: true, level: 'some', needed: false })) }
  const gotIt = (i: SupplyItemRow) => run(() => supabase.from('supply_items').update({ needed: false, got_by: me.member_id, got_at: new Date().toISOString(), ...(i.is_inventory ? { level: 'full' as SupplyLevel } : {}) }).eq('id', i.id))
  const needAgain = (i: SupplyItemRow) => run(() => supabase.from('supply_items').update({ needed: true, got_by: null, got_at: null }).eq('id', i.id))
  const setLevel = (i: SupplyItemRow, level: SupplyLevel) => run(() => supabase.from('supply_items').update({ level, ...(level === 'full' || level === 'some' ? { needed: false } : {}) }).eq('id', i.id))

  return (
    <Screen title="Needs & supplies" back="/more">
      {error && <Note kind="error" className="mb-3">{error}</Note>}
      {!items ? (
        <div className="flex justify-center py-8 text-clay-900"><Spinner /></div>
      ) : (
        <div className="space-y-4">
          <Card title={`We need (${needed.length})`}>
            <form onSubmit={addNeed} className="mb-2 flex gap-2">
              <div className="flex-1"><TextInput name="newNeed" value={newNeed} onChange={(e) => setNewNeed(e.target.value)} placeholder="Corn, batteries, gate latch…" maxLength={120} autoComplete="off" enterKeyHint="done" /></div>
              <Button type="submit" busy={busy} disabled={!newNeed.trim()}>Add</Button>
            </form>
            {needed.length === 0 ? <p className="text-sm text-ink-muted">Nothing on the list.</p> : needed.map((i, idx) => (
              <div key={i.id}>
                {idx > 0 && <Divider />}
                <div className="flex items-center gap-2 py-2">
                  <button type="button" onClick={() => setEditing(i)} className="tap min-w-0 flex-1 text-left">
                    <span className="font-semibold text-clay-950">{i.name}</span>
                    {i.is_inventory && i.level && <span className="ml-2 text-xs font-bold uppercase text-alert">{i.level}</span>}
                    {i.notes && <span className="block text-sm text-ink-muted">{i.notes}</span>}
                    <span className="block text-xs text-ink-muted">added by {nameOf(i.created_by)}</span>
                  </button>
                  <Button variant="secondary" className="!py-2" busy={busy} onClick={() => gotIt(i)}>Got it</Button>
                </div>
              </div>
            ))}
          </Card>

          <Card title="On hand">
            <form onSubmit={addInv} className="mb-2 flex gap-2">
              <div className="flex-1"><TextInput name="newInv" value={newInv} onChange={(e) => setNewInv(e.target.value)} placeholder="Track something: corn, propane, trash bags…" maxLength={120} autoComplete="off" enterKeyHint="done" /></div>
              <Button type="submit" busy={busy} disabled={!newInv.trim()}>Add</Button>
            </form>
            {inventory.length === 0 ? <p className="text-sm text-ink-muted">Nothing tracked yet. Low or out puts it on the list above.</p> : inventory.map((i, idx) => (
              <div key={i.id}>
                {idx > 0 && <Divider />}
                <div className="py-2">
                  <button type="button" onClick={() => setEditing(i)} className="tap block w-full text-left font-semibold text-clay-950">{i.name}</button>
                  <div className="mt-1 grid grid-cols-4 gap-1.5">
                    {LEVELS.map((l) => (
                      <button key={l.value} type="button" onClick={() => setLevel(i, l.value)} aria-pressed={i.level === l.value} className={`tap rounded-lg py-2 text-xs font-bold ring-1 ${i.level === l.value ? l.cls : 'bg-white text-ink-muted ring-tan-300'}`}>
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            <p className="mt-2 text-xs text-ink-muted">Low or out adds it to "We need". "Got it" sets it back to full.</p>
          </Card>

          {got.length > 0 && (
            <Card title="Recently got">
              {!showGot ? <Button variant="ghost" onClick={() => setShowGot(true)}>Show</Button> : got.map((i, idx) => (
                <div key={i.id}>
                  {idx > 0 && <Divider />}
                  <div className="flex items-center gap-2 py-2 text-sm">
                    <span className="min-w-0 flex-1 text-ink">{i.name} <span className="text-ink-muted">· {nameOf(i.got_by)} {i.got_at ? fmtDate(i.got_at.slice(0, 10)) : ''}</span></span>
                    <Button variant="ghost" className="!py-1 text-sm" onClick={() => needAgain(i)}>Need again</Button>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing?.name}>
        {editing && <EditItem key={editing.id} item={editing} canRemove={editing.created_by === me.member_id || me.is_admin} onDone={async () => { setEditing(null); await reload() }} />}
      </Sheet>
    </Screen>
  )
}

function EditItem({ item, canRemove, onDone }: { item: SupplyItemRow; canRemove: boolean; onDone: () => Promise<void> }) {
  const [name, setName] = useState(item.name)
  const [notes, setNotes] = useState(item.notes ?? '')
  const [busy, setBusy] = useState(false)
  async function save(patch: Partial<Omit<SupplyItemRow, 'id' | 'created_by' | 'created_at' | 'updated_at'>>) {
    setBusy(true)
    await supabase.from('supply_items').update(patch).eq('id', item.id)
    setBusy(false)
    await onDone()
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); void save({ name: name.trim(), notes: notes.trim() || null }) }} className="space-y-3">
      <TextInput label="Name" name="itemName" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      <TextInput label="Notes" name="itemNotes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Brand, size, where it goes…" />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" busy={busy} disabled={!name.trim()}>Save</Button>
        {!item.is_inventory ? (
          <Button variant="secondary" busy={busy} onClick={() => void save({ is_inventory: true, level: 'some' })}>Track on hand</Button>
        ) : (
          <Button variant="secondary" busy={busy} onClick={() => void save({ is_inventory: false, level: null })}>Stop tracking</Button>
        )}
        {canRemove && <Button variant="ghost" busy={busy} onClick={() => void save({ deleted_at: new Date().toISOString() })}>Remove</Button>}
      </div>
    </form>
  )
}
