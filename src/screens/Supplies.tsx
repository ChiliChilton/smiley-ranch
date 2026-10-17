import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Button, Spinner } from '../components/Button'
import { Card, Divider } from '../components/Card'
import { TextInput } from '../components/Input'
import { Note } from '../components/Note'
import { Screen } from '../components/Screen'
import { Sheet } from '../components/Sheet'
import { useSearchParams } from 'react-router'
import { AssetPicker, AssetTag } from '../components/AssetPicker'
import { TextArea } from '../components/Input'
import { loadEvents } from '../lib/events'
import { todayISO } from '../lib/dates'
import { assetName, loadAssets } from '../lib/assets'
import type { AssetRow, EventRow, SupplyItemRow, SupplyLevel } from '../lib/database.types'
import { fmtDate } from '../lib/dates'
import { friendlyError } from '../lib/errors'
import { useMembers } from '../lib/members'
import { useRealtime } from '../lib/realtime'
import { useMe } from '../lib/session'
import { supabase } from '../lib/supabase'
import { createRow } from '../lib/outbox'

const LEVELS: { value: SupplyLevel; label: string; cls: string }[] = [
  { value: 'full', label: 'Full', cls: 'bg-sage-100 text-sage-900 ring-sage-600' },
  { value: 'some', label: 'Some', cls: 'bg-clay-100 text-clay-900 ring-clay-600' },
  { value: 'low', label: 'Low', cls: 'bg-warn/20 text-tan-700 ring-warn' },
  { value: 'out', label: 'Out', cls: 'bg-alert/10 text-alert ring-alert' },
]

export function TripTag({ title }: { title: string | null | undefined }) {
  if (!title) return null
  return <span className="ml-2 rounded bg-sage-100 px-1.5 py-0.5 align-middle text-[10px] font-extrabold uppercase tracking-wide text-sage-900">{title}</span>
}

/** "We need" form. Used on Home and on a trip (initialEvent ties it to that trip). */
export function NeedForm({ assets, initialEvent = null, onDone }: { assets: AssetRow[]; initialEvent?: string | null; onDone: () => Promise<void> }) {
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [asset, setAsset] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function save(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try { await createRow('supply_items', { name: name.trim(), notes: notes.trim() || null, asset_id: asset, event_id: initialEvent, needed: true }); await onDone() } finally { setBusy(false) }
  }
  return (
    <form onSubmit={save} className="space-y-3">
      <TextInput label="What" name="needName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Corn, batteries, gate latch…" maxLength={120} autoFocus />
      <AssetPicker label="For" assets={assets} value={asset} onChange={(p) => setAsset(p === 'any' ? null : p)} />
      <TextArea label="Notes" name="needNotes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Brand, size, how many…" rows={2} />
      <Button type="submit" full busy={busy} disabled={!name.trim()}>Add it</Button>
    </form>
  )
}

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
  const [params] = useSearchParams()
  const [assets, setAssets] = useState<AssetRow[]>([])
  const [events, setEvents] = useState<EventRow[]>([])
  const [newNeedAsset, setNewNeedAsset] = useState<string | null>(params.get('asset'))
  const [newInv, setNewInv] = useState('')
  const [newInvAsset, setNewInvAsset] = useState<string | null>(null)
  const [filter, setFilter] = useState<string | null | 'any'>(params.get('asset') ?? 'any')
  const [busy, setBusy] = useState(false)
  const [showGot, setShowGot] = useState(false)
  const [editing, setEditing] = useState<SupplyItemRow | null>(null)

  const reload = useCallback(async () => {
    try {
      const [it, as, ev] = await Promise.all([loadSupplies(), loadAssets().catch(() => [] as AssetRow[]), loadEvents(todayISO()).catch(() => [] as EventRow[])])
      setItems(it); setAssets(as); setEvents(ev)
    } catch (err) { setError(friendlyError(err)) }
  }, [])
  useEffect(() => { void reload() }, [reload])
  useRealtime(['supply_items', 'assets'], reload)

  const byPlace = (i: SupplyItemRow) => filter === 'any' || i.asset_id === filter
  const needed = useMemo(() => (items ?? []).filter((i) => i.needed && byPlace(i)), [items, filter]) // eslint-disable-line react-hooks/exhaustive-deps
  const inventory = useMemo(() => (items ?? []).filter((i) => i.is_inventory && byPlace(i)), [items, filter]) // eslint-disable-line react-hooks/exhaustive-deps
  const got = useMemo(() => (items ?? []).filter((i) => !i.needed && !i.is_inventory && i.got_at).sort((a, b) => (b.got_at ?? '').localeCompare(a.got_at ?? '')).slice(0, 15), [items])

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true); setError(null)
    const { error } = await fn()
    setBusy(false)
    if (error) return setError(friendlyError(error))
    await reload()
  }

  const addNeed = (e: FormEvent) => { e.preventDefault(); const name = newNeed.trim(); if (!name) return; setNewNeed(''); void run(() => createRow('supply_items', { name, needed: true, asset_id: newNeedAsset }).then(() => ({ error: null }))) }
  const addInv = (e: FormEvent) => { e.preventDefault(); const name = newInv.trim(); if (!name) return; setNewInv(''); void run(() => createRow('supply_items', { name, is_inventory: true, level: 'some', needed: false, asset_id: newInvAsset }).then(() => ({ error: null }))) }
  const gotIt = (i: SupplyItemRow) => run(() => supabase.from('supply_items').update({ needed: false, got_by: me.member_id, got_at: new Date().toISOString(), ...(i.is_inventory ? { level: 'full' as SupplyLevel } : {}) }).eq('id', i.id))
  const needAgain = (i: SupplyItemRow) => run(() => supabase.from('supply_items').update({ needed: true, got_by: null, got_at: null }).eq('id', i.id))
  const setLevel = (i: SupplyItemRow, level: SupplyLevel) => run(() => supabase.from('supply_items').update({ level, ...(level === 'full' || level === 'some' ? { needed: false } : {}) }).eq('id', i.id))

  return (
    <Screen title="Needs">
      {error && <Note kind="error" className="mb-3">{error}</Note>}
      {!items ? (
        <div className="flex justify-center py-8 text-clay-900"><Spinner /></div>
      ) : (
        <div className="space-y-4">
          {assets.length > 0 && <AssetPicker assets={assets} value={filter} onChange={setFilter} allowAny small />}
          <Card title={`We need (${needed.length})`}>
            <form onSubmit={addNeed} className="mb-2 space-y-2">
              <div className="flex gap-2">
                <div className="flex-1"><TextInput name="newNeed" value={newNeed} onChange={(e) => setNewNeed(e.target.value)} placeholder="Corn, batteries, gate latch…" maxLength={120} autoComplete="off" enterKeyHint="done" /></div>
                <Button type="submit" busy={busy} disabled={!newNeed.trim()}>Add</Button>
              </div>
              {newNeed.trim() && <AssetPicker assets={assets} value={newNeedAsset} onChange={(p) => setNewNeedAsset(p === 'any' ? null : p)} small />}
            </form>
            {needed.length === 0 ? <p className="text-sm text-ink-muted">Nothing on the list.</p> : needed.map((i, idx) => (
              <div key={i.id}>
                {idx > 0 && <Divider />}
                <div className="flex items-center gap-2 py-2">
                  <button type="button" onClick={() => setEditing(i)} className="tap min-w-0 flex-1 text-left">
                    <span className="font-semibold text-clay-950">{i.name}</span>
                    <AssetTag name={assetName(assets, i.asset_id)} />
                    <TripTag title={events.find((e) => e.id === i.event_id)?.title} />
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
            <form onSubmit={addInv} className="mb-2 space-y-2">
              <div className="flex gap-2">
                <div className="flex-1"><TextInput name="newInv" value={newInv} onChange={(e) => setNewInv(e.target.value)} placeholder="Track something: corn, propane, trash bags…" maxLength={120} autoComplete="off" enterKeyHint="done" /></div>
                <Button type="submit" busy={busy} disabled={!newInv.trim()}>Add</Button>
              </div>
              {newInv.trim() && <AssetPicker assets={assets} value={newInvAsset} onChange={(p) => setNewInvAsset(p === 'any' ? null : p)} small />}
            </form>
            {inventory.length === 0 ? <p className="text-sm text-ink-muted">Nothing tracked yet. Low or out puts it on the list above.</p> : inventory.map((i, idx) => (
              <div key={i.id}>
                {idx > 0 && <Divider />}
                <div className="py-2">
                  <button type="button" onClick={() => setEditing(i)} className="tap block w-full text-left font-semibold text-clay-950">{i.name}<AssetTag name={assetName(assets, i.asset_id)} /></button>
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
        {editing && <EditItem key={editing.id} item={editing} assets={assets} canRemove={editing.created_by === me.member_id || me.is_admin} onDone={async () => { setEditing(null); await reload() }} />}
      </Sheet>
    </Screen>
  )
}

function EditItem({ item, assets, canRemove, onDone }: { item: SupplyItemRow; assets: AssetRow[]; canRemove: boolean; onDone: () => Promise<void> }) {
  const [name, setName] = useState(item.name)
  const [notes, setNotes] = useState(item.notes ?? '')
  const [asset, setAsset] = useState<string | null>(item.asset_id)
  const [busy, setBusy] = useState(false)
  async function save(patch: Partial<Omit<SupplyItemRow, 'id' | 'created_by' | 'created_at' | 'updated_at'>>) {
    setBusy(true)
    await supabase.from('supply_items').update(patch).eq('id', item.id)
    setBusy(false)
    await onDone()
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); void save({ name: name.trim(), notes: notes.trim() || null, asset_id: asset }) }} className="space-y-3">
      <TextInput label="Name" name="itemName" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      <AssetPicker label="For" assets={assets} value={asset} onChange={(p) => setAsset(p === 'any' ? null : p)} />
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
