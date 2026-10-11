import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Button, Spinner } from '../../components/Button'
import { TextArea, TextInput } from '../../components/Input'
import { Note } from '../../components/Note'
import { Screen } from '../../components/Screen'
import { Sheet } from '../../components/Sheet'
import type { SeasonRow, SeasonSpecies } from '../../lib/database.types'
import { fmtRange, todayISO } from '../../lib/dates'
import { friendlyError } from '../../lib/errors'
import { SPECIES, SPECIES_ORDER, loadSeasons } from '../../lib/seasons'
import { supabase } from '../../lib/supabase'

/** Admin: the hunting seasons shown on the calendar. Type in next year's dates from the TPWD Outdoor Annual. */
export function Seasons() {
  const [rows, setRows] = useState<SeasonRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<SeasonRow | 'new' | null>(null)
  const [showPast, setShowPast] = useState(false)
  const today = todayISO()

  const load = useCallback(async () => {
    try { setRows(await loadSeasons()) } catch (err) { setError(friendlyError(err)) }
  }, [])
  useEffect(() => { void load() }, [load])

  const shown = rows?.filter((r) => showPast || r.ends_on >= today) ?? []
  const pastCount = rows ? rows.length - rows.filter((r) => r.ends_on >= today).length : 0

  return (
    <Screen title="Hunting seasons" back="/more">
      {error && <Note kind="error" className="mb-4">{error}</Note>}
      <p className="mb-4 text-sm text-ink-muted">
        These show on the calendar for everyone. Dates come from the TPWD Outdoor Annual (South Zone, Gonzales County). When the new year's dates come out each summer, add them here. Hogs have no season, so they're not listed.
      </p>
      <div className="mb-4"><Button full onClick={() => setEditing('new')}>Add a season</Button></div>

      {!rows ? (
        <div className="flex justify-center py-8 text-clay-900"><Spinner /></div>
      ) : shown.length === 0 ? (
        <Note>Nothing coming up. Add this year's seasons.</Note>
      ) : (
        <ul className="space-y-2">
          {shown.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => setEditing(s)} className="tap flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left ring-1 ring-tan-200 active:bg-tan-100">
                <span className={`h-3 w-3 shrink-0 rounded-full ${SPECIES[s.species].bar}`} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-ink">{SPECIES[s.species].label} · {s.name}</span>
                  <span className="block text-sm text-ink-muted">{fmtRange(s.starts_on, s.ends_on)}{s.ends_on < today ? ' · over' : ''}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {pastCount > 0 && (
        <div className="mt-3"><Button variant="ghost" onClick={() => setShowPast((v) => !v)}>{showPast ? 'Hide past seasons' : `Show ${pastCount} past`}</Button></div>
      )}

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add a season' : 'Edit season'}>
        {editing && <SeasonForm key={editing === 'new' ? 'new' : editing.id} season={editing === 'new' ? null : editing} onDone={async () => { setEditing(null); await load() }} />}
      </Sheet>
    </Screen>
  )
}

function SeasonForm({ season, onDone }: { season: SeasonRow | null; onDone: () => Promise<void> }) {
  const [name, setName] = useState(season?.name ?? '')
  const [species, setSpecies] = useState<SeasonSpecies>(season?.species ?? 'deer')
  const [from, setFrom] = useState(season?.starts_on ?? '')
  const [to, setTo] = useState(season?.ends_on ?? '')
  const [note, setNote] = useState(season?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = name.trim().length > 0 && from.length === 10 && to.length === 10 && to >= from

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    setBusy(true); setError(null)
    const row = { name: name.trim(), species, starts_on: from, ends_on: to, note: note.trim() || null }
    const { error } = season
      ? await supabase.from('seasons').update(row).eq('id', season.id)
      : await supabase.from('seasons').insert(row)
    setBusy(false)
    if (error) return setError(friendlyError(error))
    await onDone()
  }

  async function remove() {
    if (!season) return
    setBusy(true)
    const { error } = await supabase.from('seasons').update({ deleted_at: new Date().toISOString() }).eq('id', season.id)
    setBusy(false)
    if (error) return setError(friendlyError(error))
    await onDone()
  }

  return (
    <form onSubmit={save} className="space-y-4">
      {error && <Note kind="error">{error}</Note>}
      <div>
        <span className="mb-1 block text-sm font-semibold text-clay-900">What</span>
        <div className="flex flex-wrap gap-2">
          {SPECIES_ORDER.map((k) => (
            <button key={k} type="button" onClick={() => setSpecies(k)} aria-pressed={species === k} className={`tap rounded-md px-3 py-2 text-sm font-semibold ring-1 ${species === k ? 'bg-clay-900 text-cream ring-clay-900' : 'bg-white text-clay-950 ring-tan-300'}`}>
              {SPECIES[k].label}
            </button>
          ))}
        </div>
      </div>
      <TextInput label="Season" name="seasonName" value={name} onChange={(e) => setName(e.target.value)} placeholder="General season, Archery, Youth weekend…" maxLength={80} />
      <div className="grid grid-cols-2 gap-3">
        <TextInput label="From" name="seasonFrom" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <TextInput label="To" name="seasonTo" type="date" value={to} onChange={(e) => setTo(e.target.value)} min={from || undefined} />
      </div>
      <TextArea label="Note (optional)" name="seasonNote" value={note} onChange={(e) => setNote(e.target.value)} placeholder="South Zone. Antlerless only…" rows={2} maxLength={300} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" busy={busy} disabled={!valid}>{season ? 'Save' : 'Add it'}</Button>
        {season && <Button type="button" variant="danger" busy={busy} onClick={remove}>Remove</Button>}
      </div>
    </form>
  )
}
