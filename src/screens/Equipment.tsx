import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button, Spinner } from '../components/Button'
import { TextArea, TextInput } from '../components/Input'
import { Note } from '../components/Note'
import { Screen } from '../components/Screen'
import { Sheet } from '../components/Sheet'
import { ASSET_KIND_ORDER, ASSET_KINDS, ASSET_STATUS, ASSET_STATUS_ORDER, loadAssets } from '../lib/assets'
import type { AssetKind, AssetRow, AssetStatus, SupplyItemRow, TodoRow } from '../lib/database.types'
import { fmtDate } from '../lib/dates'
import { friendlyError } from '../lib/errors'
import { useMembers } from '../lib/members'
import { useRealtime } from '../lib/realtime'
import { useMe } from '../lib/session'
import { supabase } from '../lib/supabase'
import { loadSupplies } from './Supplies'
import { TodoForm } from './Todos'

/** The house, trailer, truck, tractor, ATVs: status, a note, and what's open on each. */
export function Equipment() {
  const me = useMe()
  const navigate = useNavigate()
  const { nameOf } = useMembers()
  const [assets, setAssets] = useState<AssetRow[] | null>(null)
  const [todos, setTodos] = useState<TodoRow[]>([])
  const [needs, setNeeds] = useState<SupplyItemRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<AssetRow | null>(null)
  const [adding, setAdding] = useState(false)
  const [newJob, setNewJob] = useState<AssetRow | null>(null)

  const reload = useCallback(async () => {
    try {
      const [a, { data: t }, s] = await Promise.all([
        loadAssets(),
        supabase.from('todos').select('*').is('deleted_at', null).eq('status', 'open').not('asset_id', 'is', null).order('due_on', { ascending: true }),
        loadSupplies(),
      ])
      setAssets(a)
      setTodos(t ?? [])
      setNeeds(s.filter((i) => i.needed && i.asset_id))
      setOpen((cur) => (cur ? (a.find((x) => x.id === cur.id) ?? null) : null))
    } catch (err) {
      setError(friendlyError(err))
    }
  }, [])
  useEffect(() => { void reload() }, [reload])
  useRealtime(['assets', 'todos', 'supply_items'], reload)

  const jobsFor = (id: string) => todos.filter((t) => t.asset_id === id)
  const needsFor = (id: string) => needs.filter((n) => n.asset_id === id)

  async function setStatus(a: AssetRow, status: AssetStatus) {
    const { error } = await supabase.from('assets').update({ status }).eq('id', a.id)
    if (error) return setError(friendlyError(error))
    await reload()
  }

  return (
    <Screen title="Equipment" back="/" right={<button type="button" onClick={() => setAdding(true)} className="tap rounded-lg px-3 font-semibold active:bg-clay-800">Add</button>}>
      {error && <Note kind="error" className="mb-3">{error}</Note>}
      {!assets ? (
        <div className="flex justify-center py-8 text-clay-900"><Spinner /></div>
      ) : assets.length === 0 ? (
        <Note>Nothing listed yet. Tap Add to put the truck, tractor and ATVs here.</Note>
      ) : (
        <ul className="space-y-2">
          {assets.map((a) => {
            const st = ASSET_STATUS[a.status]
            const jobs = jobsFor(a.id)
            const ns = needsFor(a.id)
            return (
              <li key={a.id}>
                <button type="button" onClick={() => setOpen(a)} className="tap flex w-full items-start gap-3 rounded-2xl bg-white p-3 text-left ring-1 ring-tan-200 active:bg-tan-100">
                  <span className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${st.dot}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-clay-950">{a.name}</span>
                      {a.status !== 'good' && <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${st.chip}`}>{st.label}</span>}
                    </span>
                    {a.note && <span className="block text-sm text-ink">{a.note}</span>}
                    {(jobs.length > 0 || ns.length > 0) && (
                      <span className="block text-xs text-ink-muted">
                        {jobs.length > 0 && `${jobs.length} open project${jobs.length === 1 ? '' : 's'}`}
                        {jobs.length > 0 && ns.length > 0 && ' · '}
                        {ns.length > 0 && `needs ${ns.map((n) => n.name).join(', ')}`}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <p className="mt-3 text-xs text-ink-muted">Anyone can add a machine, mark something down, and leave a note. Projects and needs tagged to a machine show up on it.</p>

      <Sheet open={open !== null} onClose={() => setOpen(null)} title={open?.name}>
        {open && (
          <div className="space-y-4">
            <div>
              <span className="mb-1 block text-sm font-semibold text-clay-900">How is it</span>
              <div className="grid grid-cols-3 gap-2">
                {ASSET_STATUS_ORDER.map((s) => (
                  <button key={s} type="button" onClick={() => setStatus(open, s)} aria-pressed={open.status === s} className={`tap rounded-md px-2 py-2 text-sm font-bold ring-1 ${open.status === s ? 'bg-clay-900 text-cream ring-clay-900' : 'bg-white text-clay-950 ring-tan-500'}`}>
                    {ASSET_STATUS[s].label}
                  </button>
                ))}
              </div>
            </div>
            <NoteForm asset={open} onSaved={reload} />
            <div>
              <div className="mb-1 text-xs font-bold uppercase tracking-wide text-clay-800">Open on it</div>
              {jobsFor(open.id).length === 0 && needsFor(open.id).length === 0 ? (
                <p className="text-sm text-ink-muted">Nothing open.</p>
              ) : (
                <ul className="text-sm text-ink">
                  {jobsFor(open.id).map((t) => <li key={t.id}>• {t.title} <span className="text-ink-muted">· {t.assignee_id ? nameOf(t.assignee_id) : 'anyone'}{t.due_on ? `, due ${fmtDate(t.due_on, { weekday: false })}` : ''}</span></li>)}
                  {needsFor(open.id).map((n) => <li key={n.id}>• Need: {n.name}{n.notes ? <span className="text-ink-muted"> · {n.notes}</span> : null}</li>)}
                </ul>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => { setNewJob(open); setOpen(null) }}>+ Project</Button>
                <Button variant="secondary" onClick={() => navigate(`/supplies?asset=${open.id}`)}>+ Need</Button>
              </div>
            </div>
            <AdminAssetForm asset={open} canRemove={me.is_admin} onDone={async () => { setOpen(null); await reload() }} />
          </div>
        )}
      </Sheet>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add equipment or a building">
        {adding && <AdminAssetForm asset={null} canRemove={false} onDone={async () => { setAdding(false); await reload() }} />}
      </Sheet>

      <Sheet open={newJob !== null} onClose={() => setNewJob(null)} title={newJob ? `Project on ${newJob.name}` : ''}>
        {newJob && <TodoForm todo={null} initialAsset={newJob.id} onDone={async () => { setNewJob(null); await reload() }} />}
      </Sheet>
    </Screen>
  )
}

function NoteForm({ asset, onSaved }: { asset: AssetRow; onSaved: () => Promise<void> }) {
  const [note, setNote] = useState(asset.note ?? '')
  const [busy, setBusy] = useState(false)
  useEffect(() => setNote(asset.note ?? ''), [asset])
  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    await supabase.from('assets').update({ note: note.trim() || null }).eq('id', asset.id)
    setBusy(false)
    await onSaved()
  }
  return (
    <form onSubmit={save} className="flex items-end gap-2">
      <div className="flex-1"><TextArea label="Note" name="assetNote" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Flat on the left rear, oil changed in March…" rows={2} maxLength={500} /></div>
      <Button type="submit" busy={busy} disabled={(note.trim() || null) === (asset.note ?? null)}>Save</Button>
    </form>
  )
}

function AdminAssetForm({ asset, canRemove, onDone }: { asset: AssetRow | null; canRemove: boolean; onDone: () => Promise<void> }) {
  const [name, setName] = useState(asset?.name ?? '')
  const [kind, setKind] = useState<AssetKind>(asset?.kind ?? 'vehicle')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function save(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true); setError(null)
    const { error } = asset
      ? await supabase.from('assets').update({ name: name.trim(), kind }).eq('id', asset.id)
      : await supabase.from('assets').insert({ name: name.trim(), kind, sort_order: 50 })
    setBusy(false)
    if (error) return setError(friendlyError(error))
    await onDone()
  }
  async function remove() {
    if (!asset) return
    setBusy(true)
    const { error } = await supabase.from('assets').update({ deleted_at: new Date().toISOString() }).eq('id', asset.id)
    setBusy(false)
    if (error) return setError(friendlyError(error))
    await onDone()
  }
  return (
    <form onSubmit={save} className="space-y-3 border-t border-tan-200 pt-3">
      {asset && <div className="text-xs font-bold uppercase tracking-wide text-clay-800">Name and kind</div>}
      {error && <Note kind="error">{error}</Note>}
      <TextInput label="Name" name="assetName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Truck, Tractor, ATV 2, Haul trailer…" maxLength={60} autoFocus={!asset} />
      <div>
        <span className="mb-1 block text-sm font-semibold text-clay-900">Kind</span>
        <div className="flex flex-wrap gap-1.5">
          {ASSET_KIND_ORDER.map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className={`tap rounded-md px-3 py-1.5 text-xs font-bold ring-1 ${kind === k ? 'bg-clay-900 text-cream ring-clay-900' : 'bg-white text-clay-950 ring-tan-500'}`}>{ASSET_KINDS[k]}</button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" busy={busy} disabled={!name.trim()}>{asset ? 'Rename' : 'Add it'}</Button>
        {asset && canRemove && <Button type="button" variant="ghost" busy={busy} onClick={remove}>Remove from list</Button>}
      </div>
    </form>
  )
}
