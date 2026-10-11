import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button, Spinner } from '../components/Button'
import { EmergencyCard } from '../components/EmergencyCard'
import { TextArea, TextInput } from '../components/Input'
import { Note } from '../components/Note'
import { Screen } from '../components/Screen'
import { Section, SectionLink } from '../components/Section'
import { Sheet } from '../components/Sheet'
import type { InfoItemRow, InfoSection } from '../lib/database.types'
import { friendlyError } from '../lib/errors'
import { INFO_SECTION_ORDER, INFO_SECTIONS, loadInfo, phoneIn } from '../lib/info'
import { useRealtime } from '../lib/realtime'
import { useMe } from '../lib/session'
import { useSettings } from '../lib/settings'
import { supabase } from '../lib/supabase'

/** The stuff people text each other about every trip. Everyone reads, the admin edits in place. */
export function RanchInfo() {
  const me = useMe()
  const navigate = useNavigate()
  const { values: settings } = useSettings()
  const [items, setItems] = useState<InfoItemRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<InfoItemRow | { section: InfoSection } | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try { setItems(await loadInfo()) } catch (err) { setError(friendlyError(err)) }
  }, [])
  useEffect(() => { void reload() }, [reload])
  useRealtime(['info_items'], reload)

  async function copy(it: InfoItemRow) {
    try { await navigator.clipboard.writeText(it.value); setCopied(it.id); setTimeout(() => setCopied(null), 1500) } catch { /* no clipboard */ }
  }

  const beds = settings?.beds

  return (
    <Screen title="Ranch info" back="/">
      {error && <Note kind="error" className="mb-3">{error}</Note>}
      {!items ? (
        <div className="flex justify-center py-8 text-clay-900"><Spinner /></div>
      ) : (
        <div className="space-y-6">
          <Section title="Emergency" action={me.is_admin ? <SectionLink onClick={() => navigate('/more/emergency')}>Edit</SectionLink> : undefined}>
            <EmergencyCard />
          </Section>

          {INFO_SECTION_ORDER.map((sec) => {
            const rows = items.filter((i) => i.section === sec && (i.value || me.is_admin))
            if (rows.length === 0 && !me.is_admin) return null
            return (
              <Section key={sec} title={INFO_SECTIONS[sec].title} action={me.is_admin ? <SectionLink onClick={() => setEditing({ section: sec })}>+ Add</SectionLink> : undefined}>
                {rows.length === 0 ? (
                  <p className="py-1 text-sm text-ink-muted">Nothing here yet.</p>
                ) : (
                  <ul className="divide-y divide-tan-200">
                    {rows.map((it) => {
                      const tel = sec === 'contacts' ? phoneIn(it.value) : null
                      return (
                        <li key={it.id} className="flex items-start gap-2 py-2">
                          <button type="button" onClick={() => (me.is_admin ? setEditing(it) : copy(it))} className="tap min-w-0 flex-1 py-0.5 text-left">
                            <span className="block text-xs font-bold uppercase tracking-wide text-clay-800">{it.label}</span>
                            <span className={`block whitespace-pre-wrap text-[15px] ${it.value ? 'text-ink' : 'italic text-ink-muted'}`}>{it.value || 'not filled in yet'}</span>
                            {copied === it.id && <span className="text-xs text-ok">Copied</span>}
                          </button>
                          {tel && <a href={`tel:${tel}`} className="tap inline-flex items-center rounded-md bg-tan-200 px-3 py-1.5 text-sm font-semibold text-clay-950 active:bg-tan-300">Call</a>}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Section>
            )
          })}

          <Section title="The place">
            <p className="py-1 text-sm text-ink">
              Sleeps {beds ?? '4'}.{' '}
              <button type="button" className="font-semibold text-clay-900 underline" onClick={() => navigate('/equipment')}>Equipment and buildings</button>
            </p>
          </Section>
          {!me.is_admin && <p className="text-xs text-ink-muted">Tap a line to copy it. The admin keeps this page current.</p>}
        </div>
      )}

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing && 'id' in editing ? editing.label : 'Add a line'}>
        {editing && <InfoForm key={'id' in editing ? editing.id : 'new'} item={'id' in editing ? editing : null} section={editing.section} onDone={async () => { setEditing(null); await reload() }} />}
      </Sheet>
    </Screen>
  )
}

function InfoForm({ item, section, onDone }: { item: InfoItemRow | null; section: InfoSection; onDone: () => Promise<void> }) {
  const [label, setLabel] = useState(item?.label ?? '')
  const [value, setValue] = useState(item?.value ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!label.trim()) return
    setBusy(true); setError(null)
    const { error } = item
      ? await supabase.from('info_items').update({ label: label.trim(), value: value.trim() }).eq('id', item.id)
      : await supabase.from('info_items').insert({ section, label: label.trim(), value: value.trim() })
    setBusy(false)
    if (error) return setError(friendlyError(error))
    await onDone()
  }
  async function remove() {
    if (!item) return
    setBusy(true)
    const { error } = await supabase.from('info_items').update({ deleted_at: new Date().toISOString() }).eq('id', item.id)
    setBusy(false)
    if (error) return setError(friendlyError(error))
    await onDone()
  }

  return (
    <form onSubmit={save} className="space-y-3">
      {error && <Note kind="error">{error}</Note>}
      <p className="text-xs text-ink-muted">{INFO_SECTIONS[section].title} · {INFO_SECTIONS[section].blurb}</p>
      <TextInput label="Label" name="infoLabel" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Gate code, Wi-Fi password, Propane company…" maxLength={80} autoFocus={!item} />
      <TextArea label="What to know" name="infoValue" value={value} onChange={(e) => setValue(e.target.value)} placeholder="The code, the number, where it is, what to do…" rows={3} maxLength={1000} autoFocus={Boolean(item)} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" busy={busy} disabled={!label.trim()}>{item ? 'Save' : 'Add it'}</Button>
        {item && <Button type="button" variant="ghost" busy={busy} onClick={remove}>Remove</Button>}
      </div>
    </form>
  )
}
