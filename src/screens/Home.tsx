import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../components/Button'
import { EmergencyCard } from '../components/EmergencyCard'
import { KindBadge } from '../components/EventListRow'
import { TextArea, TextInput } from '../components/Input'
import { Note } from '../components/Note'
import { Screen } from '../components/Screen'
import { Section, SectionLink } from '../components/Section'
import { Sheet } from '../components/Sheet'
import type { CheckoutRow, EventAttendeeRow, EventRow, FeederFillRow, LogEntryRow, PinRow, SupplyItemRow, SupplyPlace, TodoRow } from '../lib/database.types'
import { fmtDate, fmtDateTime, fmtRange, parseISODate, relativeDay, todayISO } from '../lib/dates'
import { loadEvents } from '../lib/events'
import { feederStatus, loadFeeders, recordFill } from '../lib/feeders'
import { useMembers } from '../lib/members'
import { createRow } from '../lib/outbox'
import { useRealtime } from '../lib/realtime'
import { useMe, useSession } from '../lib/session'
import { emergencyFrom, useSettings } from '../lib/settings'
import { supabase } from '../lib/supabase'
import { loadLastCheckout } from './Checkout'
import { Brand } from '../components/Brand'
import { FeederCard, FillDetailsSheet } from './Feeders'
import { loadLog } from './Log'
import { loadSupplies, PlacePicker, PlaceTag } from './Supplies'
import { TodoForm } from './Todos'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** The board: the current or next stay, needs, projects, then the rest of the place. */
export function Home() {
  const me = useMe()
  const session = useSession()
  const navigate = useNavigate()
  const { nameOf } = useMembers()
  const { values: settings } = useSettings()
  const offline = session.status === 'ready' && session.offline
  const today = todayISO()

  const [events, setEvents] = useState<EventRow[]>([])
  const [stayGoing, setStayGoing] = useState<EventAttendeeRow[]>([])
  const [last, setLast] = useState<CheckoutRow | null>(null)
  const [feeders, setFeeders] = useState<{ feeders: PinRow[]; lastFill: Map<string, FeederFillRow> } | null>(null)
  const [justFilled, setJustFilled] = useState<{ feeder: PinRow; fill: FeederFillRow } | null>(null)
  const [log, setLog] = useState<LogEntryRow[]>([])
  const [todos, setTodos] = useState<TodoRow[]>([])
  const [needs, setNeeds] = useState<SupplyItemRow[]>([])
  const [adding, setAdding] = useState<'need' | 'project' | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  // The stay: a "just us" or "come join" entry happening now, else the next one.
  const stays = events.filter((e) => e.kind !== 'info')
  const stay = stays.find((e) => e.starts_on <= today && e.ends_on >= today) ?? stays[0] ?? null
  const stayIsNow = Boolean(stay && stay.starts_on <= today && stay.ends_on >= today)
  const upcoming = events.filter((e) => e.id !== stay?.id).slice(0, 3)

  const reload = useCallback(async () => {
    const [ev, co, fd, lg, td, sp] = await Promise.all([
      loadEvents(today).catch(() => null),
      loadLastCheckout(),
      loadFeeders().catch(() => null),
      loadLog(3).catch(() => []),
      supabase.from('todos').select('*').is('deleted_at', null).eq('status', 'open').order('due_on', { ascending: true }).order('created_at', { ascending: false }).limit(60).then((r) => r.data ?? []),
      loadSupplies().catch(() => []),
    ])
    if (ev) {
      setEvents(ev.slice(0, 8))
      const s = ev.filter((e) => e.kind !== 'info')
      const cur = s.find((e) => e.starts_on <= today && e.ends_on >= today) ?? s[0]
      if (cur) {
        const { data } = await supabase.from('event_attendees').select('*').eq('event_id', cur.id).order('created_at')
        setStayGoing(data ?? [])
      } else setStayGoing([])
    }
    setLast(co)
    setFeeders(fd)
    setLog(lg)
    setTodos(td)
    setNeeds(sp.filter((i) => i.needed))
  }, [today])

  useEffect(() => { void reload() }, [reload])
  useRealtime(['events', 'event_attendees', 'checkouts', 'feeder_fills', 'log_entries', 'todos', 'supply_items'], reload)

  const feedersDue = (feeders?.feeders ?? []).filter((f) => ['due', 'overdue'].includes(feederStatus(f, feeders!.lastFill.get(f.id)).status))
  const mine = todos.filter((t) => t.assignee_id === me.member_id)
  const others = todos.filter((t) => t.assignee_id !== me.member_id)
  const shownJobs = [...mine, ...others].slice(0, 6)
  const emergency = emergencyFrom(settings)
  const d = parseISODate(today)
  const dateLabel = `${DOW[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`

  async function gotIt(i: SupplyItemRow) {
    setBusy(i.id)
    try { await supabase.from('supply_items').update({ needed: false, got_by: me.member_id, got_at: new Date().toISOString() }).eq('id', i.id); await reload() } finally { setBusy(null) }
  }
  async function done(t: TodoRow) {
    setBusy(t.id)
    try { await supabase.from('todos').update({ status: 'done', completed_by: me.member_id, completed_at: new Date().toISOString() }).eq('id', t.id); await reload() } finally { setBusy(null) }
  }

  return (
    <Screen title={`${settings?.property_name ?? 'Smiley Ranch'} · ${dateLabel}`} leading={<Brand size={26} />}>
      {offline && <Note kind="warn" className="mb-3">No signal right now. Showing what we had last time.</Note>}

      <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
        {([['Stands', '/stands'], ['Map', '/map'], ['Property notes', '/log'], ['Feeders', '/feeders'], ['Harvests', '/harvests']] as const).map(([label, to]) => (
          <button key={to} type="button" onClick={() => navigate(to)} className="tap shrink-0 rounded-md border border-tan-500 bg-white px-3 py-2 text-sm font-semibold text-clay-950 active:bg-tan-100">
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-6">
        <Section title={stayIsNow ? 'Current stay' : 'Next stay'} action={<SectionLink onClick={() => navigate('/calendar')}>Calendar</SectionLink>}>
          {!stay ? (
            <p className="py-1 text-sm text-ink-muted">
              Nothing planned. <button type="button" className="font-semibold text-clay-900 underline" onClick={() => navigate('/calendar/new')}>Add a stay</button>
            </p>
          ) : (
            <button type="button" onClick={() => navigate(`/calendar/${stay.id}`)} className="tap flex w-full items-start gap-3 py-1 text-left">
              <span className="w-12 shrink-0 text-center leading-none">
                <span className="block text-[10px] font-extrabold uppercase text-clay-800">{MONTHS[parseISODate(stay.starts_on).getMonth()]}</span>
                <span className="block text-2xl font-extrabold text-clay-950">{parseISODate(stay.starts_on).getDate()}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-lg font-bold text-clay-950">{stay.title}</span>
                  <KindBadge kind={stay.kind} mine={stay.created_by === me.member_id} />
                </span>
                <span className="block text-sm text-ink">{fmtRange(stay.starts_on, stay.ends_on)} · {stayIsNow ? 'happening now' : relativeDay(stay.starts_on)}</span>
                <span className="block text-sm text-ink-muted">
                  {stayGoing.length === 0 ? `${nameOf(stay.created_by)} · nobody has said they're in yet` : `Going: ${stayGoing.map((a) => nameOf(a.member_id)).join(', ')}`}
                </span>
                {stay.notes && <span className="mt-1 block text-sm text-ink">{stay.notes.length > 100 ? stay.notes.slice(0, 100) + '…' : stay.notes}</span>}
              </span>
            </button>
          )}
          {upcoming.length > 0 && (
            <ul className="mt-1 border-t border-tan-200 pt-1">
              {upcoming.map((e) => (
                <li key={e.id}>
                  <button type="button" onClick={() => navigate(`/calendar/${e.id}`)} className="tap flex w-full items-center gap-3 py-1 text-left text-sm">
                    <span className="w-12 shrink-0 text-center text-xs font-bold text-clay-800">{MONTHS[parseISODate(e.starts_on).getMonth()]} {parseISODate(e.starts_on).getDate()}</span>
                    <span className="min-w-0 flex-1 truncate text-ink">{e.title}</span>
                    <KindBadge kind={e.kind} mine={e.created_by === me.member_id} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Needs" count={needs.length} action={<SectionLink onClick={() => setAdding('need')}>+ Add</SectionLink>}>
          {needs.length === 0 ? (
            <p className="py-1 text-sm text-ink-muted">Nothing on the list.</p>
          ) : (
            <ul className="divide-y divide-tan-200">
              {needs.slice(0, 6).map((i) => (
                <li key={i.id} className="flex items-center gap-2 py-1.5">
                  <span className="min-w-0 flex-1 text-[15px] text-ink">
                    {i.name}
                    <PlaceTag place={i.place} />
                    {i.is_inventory && i.level && <span className="ml-2 text-[10px] font-extrabold uppercase text-alert">{i.level}</span>}
                    {i.notes && <span className="block text-xs text-ink-muted">{i.notes}</span>}
                  </span>
                  <Button variant="secondary" className="!min-h-0 !px-3 !py-1.5 text-sm" busy={busy === i.id} onClick={() => gotIt(i)}>Got it</Button>
                </li>
              ))}
            </ul>
          )}
          {needs.length > 6 && <SectionLink onClick={() => navigate('/supplies')}>{needs.length - 6} more on the list</SectionLink>}
        </Section>

        <Section title="Projects" count={`${todos.length} open`} action={<SectionLink onClick={() => setAdding('project')}>+ Add</SectionLink>}>
          {shownJobs.length === 0 ? (
            <p className="py-1 text-sm text-ink-muted">Nothing open.</p>
          ) : (
            <ul className="divide-y divide-tan-200">
              {shownJobs.map((t) => {
                const overdue = t.due_on && t.due_on < today
                return (
                  <li key={t.id} className="flex items-center gap-2 py-1.5">
                    <button type="button" aria-label={`Mark ${t.title} done`} disabled={busy === t.id} onClick={() => done(t)} className="tap flex h-10 w-8 shrink-0 items-center justify-center">
                      <span className="h-6 w-6 rounded border-2 border-tan-600 bg-white" />
                    </button>
                    <button type="button" onClick={() => navigate('/todos')} className="min-w-0 flex-1 py-1 text-left">
                      <span className="block truncate text-[15px] font-semibold text-clay-950">{t.title}</span>
                      <span className="block text-xs text-ink-muted">
                        {t.assignee_id ? (t.assignee_id === me.member_id ? 'You' : nameOf(t.assignee_id)) : 'Anyone'}
                        {t.due_on && <span className={overdue ? ' font-bold text-alert' : ''}> · {overdue ? 'was due' : 'due'} {fmtDate(t.due_on, { weekday: false })}</span>}
                        {t.notes && ` · ${t.notes.length > 50 ? t.notes.slice(0, 50) + '…' : t.notes}`}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {todos.length > 6 && <SectionLink onClick={() => navigate('/todos')}>{todos.length - 6} more open</SectionLink>}
        </Section>

        {feedersDue.length > 0 && (
          <Section title="Feeders running low" count={feedersDue.length} action={<SectionLink onClick={() => navigate('/feeders')}>All feeders</SectionLink>}>
            <ul className="space-y-2">
              {feedersDue.map((f) => (
                <li key={f.id}>
                  <FeederCard feeder={f} fill={feeders!.lastFill.get(f.id)} compact onFilled={async () => { const fill = await recordFill(f.id); setJustFilled({ feeder: f, fill }); await reload() }} />
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Property notes" action={<SectionLink onClick={() => navigate('/log')}>All notes</SectionLink>}>
          {log.length === 0 ? (
            <p className="py-1 text-sm text-ink-muted">No notes yet.</p>
          ) : (
            <ul className="divide-y divide-tan-200">
              {log.map((e) => (
                <li key={e.id} className="py-1.5 text-sm">
                  <span className="text-ink">{e.body.length > 120 ? e.body.slice(0, 120) + '…' : e.body}</span>
                  <span className="block text-xs text-ink-muted">{nameOf(e.created_by)} · {fmtDateTime(e.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
          {last && (
            <p className="mt-1 text-xs text-ink-muted">
              Last checked out: {nameOf(last.member_id)}, {fmtDateTime(last.left_at)}{last.all_done ? ', all done' : `, skipped ${last.items.filter((i) => !i.done).length}`}.
            </p>
          )}
        </Section>

        <Section title="Emergency">
          {emergency.address ? <EmergencyCard compact /> : <EmergencyCard />}
        </Section>
      </div>

      <Sheet open={adding === 'project'} onClose={() => setAdding(null)} title="New project or job">
        {adding === 'project' && <TodoForm todo={null} onDone={async () => { setAdding(null); await reload() }} />}
      </Sheet>
      <Sheet open={adding === 'need'} onClose={() => setAdding(null)} title="We need">
        {adding === 'need' && <NeedForm onDone={async () => { setAdding(null); await reload() }} />}
      </Sheet>
      <FillDetailsSheet entry={justFilled} onClose={() => setJustFilled(null)} onSaved={async () => { setJustFilled(null); await reload() }} />
    </Screen>
  )
}

function NeedForm({ onDone }: { onDone: () => Promise<void> }) {
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [place, setPlace] = useState<SupplyPlace | null>(null)
  const [busy, setBusy] = useState(false)
  async function save(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try { await createRow('supply_items', { name: name.trim(), notes: notes.trim() || null, place, needed: true }); await onDone() } finally { setBusy(false) }
  }
  return (
    <form onSubmit={save} className="space-y-3">
      <TextInput label="What" name="needName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Corn, batteries, gate latch…" maxLength={120} autoFocus />
      <div>
        <span className="mb-1 block text-sm font-semibold text-clay-900">Where</span>
        <PlacePicker value={place} onChange={(p) => setPlace(p === 'any' ? null : p)} />
      </div>
      <TextArea label="Notes" name="needNotes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Brand, size, how many…" rows={2} />
      <Button type="submit" full busy={busy} disabled={!name.trim()}>Add it</Button>
    </form>
  )
}
