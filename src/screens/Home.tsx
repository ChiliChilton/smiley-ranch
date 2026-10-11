import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../components/Button'
import { CheckinCard } from '../components/CheckinCard'
import { EmergencyCard } from '../components/EmergencyCard'
import { KindBadge } from '../components/EventListRow'
import { TextInput } from '../components/Input'
import { Note } from '../components/Note'
import { Screen } from '../components/Screen'
import { Section, SectionLink } from '../components/Section'
import { loadClaims, SIT_LABEL, weekendDates } from '../lib/claims'
import type { CheckoutRow, EventRow, FeederFillRow, LogEntryRow, PinRow, StandClaimRow, SupplyItemRow, TodoRow } from '../lib/database.types'
import { fmtDate, fmtDateTime, fmtRange, parseISODate, todayISO } from '../lib/dates'
import { loadEvents } from '../lib/events'
import { feederStatus, loadFeeders, recordFill } from '../lib/feeders'
import { createRow } from '../lib/outbox'
import { useMembers } from '../lib/members'
import { useRealtime } from '../lib/realtime'
import { useMe, useSession } from '../lib/session'
import { emergencyFrom, useSettings } from '../lib/settings'
import { supabase } from '../lib/supabase'
import { loadLastCheckout } from './Checkout'
import { FeederCard, FillDetailsSheet } from './Feeders'
import { loadLog } from './Log'
import { loadSupplies } from './Supplies'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The board. Needs, projects, and the calendar first; hunting and the place one tap away. */
export function Home() {
  const me = useMe()
  const session = useSession()
  const navigate = useNavigate()
  const { nameOf } = useMembers()
  const { values: settings } = useSettings()
  const offline = session.status === 'ready' && session.offline
  const today = todayISO()

  const [events, setEvents] = useState<EventRow[]>([])
  const [last, setLast] = useState<CheckoutRow | null>(null)
  const [weekend, setWeekend] = useState<{ days: string[]; claims: StandClaimRow[]; stands: PinRow[] } | null>(null)
  const [feeders, setFeeders] = useState<{ feeders: PinRow[]; lastFill: Map<string, FeederFillRow> } | null>(null)
  const [justFilled, setJustFilled] = useState<{ feeder: PinRow; fill: FeederFillRow } | null>(null)
  const [log, setLog] = useState<LogEntryRow[]>([])
  const [todos, setTodos] = useState<TodoRow[]>([])
  const [needs, setNeeds] = useState<SupplyItemRow[]>([])
  const [newNeed, setNewNeed] = useState('')
  const [newJob, setNewJob] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const days = weekendDates()
    const [ev, co, cl, st, fd, lg, td, sp] = await Promise.all([
      loadEvents(today).catch(() => null),
      loadLastCheckout(),
      days.length ? loadClaims(days[0], days[days.length - 1]).catch(() => []) : Promise.resolve([]),
      supabase.from('pins').select('*').eq('type', 'stand').is('deleted_at', null).then((r) => r.data ?? []),
      loadFeeders().catch(() => null),
      loadLog(3).catch(() => []),
      supabase.from('todos').select('*').is('deleted_at', null).eq('status', 'open').order('due_on', { ascending: true }).order('created_at', { ascending: false }).limit(60).then((r) => r.data ?? []),
      loadSupplies().catch(() => []),
    ])
    if (ev) setEvents(ev.slice(0, 5))
    setLast(co)
    setWeekend({ days, claims: cl, stands: st })
    setFeeders(fd)
    setLog(lg)
    setTodos(td)
    setNeeds(sp.filter((i) => i.needed))
  }, [today])

  useEffect(() => { void reload() }, [reload])
  useRealtime(['events', 'checkouts', 'stand_claims', 'feeder_fills', 'log_entries', 'todos', 'supply_items'], reload)

  const feedersDue = (feeders?.feeders ?? []).filter((f) => ['due', 'overdue'].includes(feederStatus(f, feeders!.lastFill.get(f.id)).status))
  const mine = todos.filter((t) => t.assignee_id === me.member_id)
  const others = todos.filter((t) => t.assignee_id !== me.member_id)
  const shownJobs = [...mine, ...others].slice(0, 6)
  const emergency = emergencyFrom(settings)
  const d = parseISODate(today)
  const dateLabel = `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`

  async function addNeed(e: FormEvent) {
    e.preventDefault()
    const name = newNeed.trim()
    if (!name) return
    setBusy('need'); setNewNeed('')
    try { await createRow('supply_items', { name, needed: true }); await reload() } finally { setBusy(null) }
  }
  async function gotIt(i: SupplyItemRow) {
    setBusy(i.id)
    try { await supabase.from('supply_items').update({ needed: false, got_by: me.member_id, got_at: new Date().toISOString() }).eq('id', i.id); await reload() } finally { setBusy(null) }
  }
  async function addJob(e: FormEvent) {
    e.preventDefault()
    const title = newJob.trim()
    if (!title) return
    setBusy('job'); setNewJob('')
    try { await createRow('todos', { title, assignee_id: null }); await reload() } finally { setBusy(null) }
  }
  async function done(t: TodoRow) {
    setBusy(t.id)
    try { await supabase.from('todos').update({ status: 'done', completed_by: me.member_id, completed_at: new Date().toISOString() }).eq('id', t.id); await reload() } finally { setBusy(null) }
  }

  return (
    <Screen title={`${settings?.property_name ?? 'Back 40'} · ${dateLabel}`}>
      {offline && <Note kind="warn" className="mb-3">No signal right now. Showing what we had last time.</Note>}

      {/* Quick links to the hunting side and the place */}
      <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
        {([['Stands', '/stands'], ['Map', '/map'], ['Log', '/log'], ['Feeders', '/feeders'], ['Sightings', '/sightings'], ['Harvests', '/harvests'], ['Before you leave', '/checkout']] as const).map(([label, to]) => (
          <button key={to} type="button" onClick={() => navigate(to)} className="tap shrink-0 rounded-md border border-tan-500 bg-white px-3 py-2 text-sm font-semibold text-clay-950 active:bg-tan-100">
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-6">
        <CheckinCard />

        <Section title="Needs" count={needs.length} action={<SectionLink onClick={() => navigate('/supplies')}>All needs</SectionLink>}>
          {needs.length === 0 ? (
            <p className="py-1 text-sm text-ink-muted">Nothing on the list.</p>
          ) : (
            <ul className="divide-y divide-tan-200">
              {needs.slice(0, 6).map((i) => (
                <li key={i.id} className="flex items-center gap-2 py-1.5">
                  <span className="min-w-0 flex-1 text-[15px] text-ink">
                    {i.name}
                    {i.is_inventory && i.level && <span className="ml-2 text-[10px] font-extrabold uppercase text-alert">{i.level}</span>}
                    <span className="block text-xs text-ink-muted">{nameOf(i.created_by)}</span>
                  </span>
                  <Button variant="secondary" className="!min-h-0 !px-3 !py-1.5 text-sm" busy={busy === i.id} onClick={() => gotIt(i)}>Got it</Button>
                </li>
              ))}
              {needs.length > 6 && <li className="py-1.5 text-sm text-ink-muted">and {needs.length - 6} more</li>}
            </ul>
          )}
          <form onSubmit={addNeed} className="mt-2 flex gap-2">
            <div className="flex-1"><TextInput name="homeNeed" value={newNeed} onChange={(e) => setNewNeed(e.target.value)} placeholder="We need…" maxLength={120} autoComplete="off" enterKeyHint="done" /></div>
            <Button type="submit" variant="secondary" busy={busy === 'need'} disabled={!newNeed.trim()}>Add</Button>
          </form>
        </Section>

        <Section title="Projects" count={`${todos.length} open`} action={<SectionLink onClick={() => navigate('/todos')}>All projects</SectionLink>}>
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
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <form onSubmit={addJob} className="mt-2 flex gap-2">
            <div className="flex-1"><TextInput name="homeJob" value={newJob} onChange={(e) => setNewJob(e.target.value)} placeholder="Something that needs doing…" maxLength={200} autoComplete="off" enterKeyHint="done" /></div>
            <Button type="submit" variant="secondary" busy={busy === 'job'} disabled={!newJob.trim()}>Add</Button>
          </form>
        </Section>

        <Section title="Calendar" action={<SectionLink onClick={() => navigate('/calendar')}>Open calendar</SectionLink>}>
          {events.length === 0 ? (
            <p className="py-1 text-sm text-ink-muted">Nothing coming up. <button type="button" className="font-semibold text-clay-900 underline" onClick={() => navigate('/calendar/new')}>Add a trip or work day</button></p>
          ) : (
            <ul className="divide-y divide-tan-200">
              {events.map((e) => {
                const s = parseISODate(e.starts_on)
                return (
                  <li key={e.id}>
                    <button type="button" onClick={() => navigate(`/calendar/${e.id}`)} className="tap flex w-full items-center gap-3 py-1.5 text-left">
                      <span className="w-11 shrink-0 text-center leading-none">
                        <span className="block text-[10px] font-extrabold uppercase text-clay-800">{MONTHS[s.getMonth()]}</span>
                        <span className="block text-xl font-extrabold text-clay-950">{s.getDate()}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-semibold text-clay-950">{e.title}</span>
                          <KindBadge kind={e.kind} mine={e.created_by === me.member_id} />
                        </span>
                        <span className="block text-xs text-ink-muted">{fmtRange(e.starts_on, e.ends_on)} · {nameOf(e.created_by)}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Section>

        <Section title="This weekend's stands" action={<SectionLink onClick={() => navigate('/stands')}>Claim a stand</SectionLink>}>
          {!weekend ? (
            <p className="py-1 text-sm text-ink-muted">Loading…</p>
          ) : weekend.claims.length === 0 ? (
            <p className="py-1 text-sm text-ink-muted">Nobody has claimed a stand yet.</p>
          ) : (
            <div className="space-y-1 py-1 text-sm">
              {weekend.days.map((d) => {
                const dayClaims = weekend.claims.filter((c) => c.date === d)
                if (dayClaims.length === 0) return null
                return (
                  <div key={d} className="flex gap-3">
                    <span className="w-16 shrink-0 font-bold text-clay-950">{fmtDate(d).split(',')[0]}</span>
                    <span className="min-w-0 flex-1 text-ink">
                      {(['am', 'pm'] as const).map((sit) => {
                        const list = dayClaims.filter((c) => c.sit === sit)
                        if (!list.length) return null
                        return <span key={sit} className="block"><span className="font-semibold text-ink-muted">{SIT_LABEL[sit]}</span> {list.map((c) => `${weekend.stands.find((s) => s.id === c.stand_id)?.name ?? 'Stand'} · ${nameOf(c.member_id)}`).join(', ')}</span>
                      })}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </Section>

        {feedersDue.length > 0 && (
          <Section title="Feeders due" count={feedersDue.length} action={<SectionLink onClick={() => navigate('/feeders')}>All feeders</SectionLink>}>
            <ul className="space-y-2">
              {feedersDue.map((f) => (
                <li key={f.id}>
                  <FeederCard feeder={f} fill={feeders!.lastFill.get(f.id)} compact onFilled={async () => { const fill = await recordFill(f.id); setJustFilled({ feeder: f, fill }); await reload() }} />
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Latest" action={<SectionLink onClick={() => navigate('/log')}>Open the log</SectionLink>}>
          {log.length === 0 ? (
            <p className="py-1 text-sm text-ink-muted">Nothing in the log yet.</p>
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
              Last out: {nameOf(last.member_id)}, {fmtDateTime(last.left_at)}{last.all_done ? ', all done' : `, skipped ${last.items.filter((i) => !i.done).length}`}.
            </p>
          )}
        </Section>

        <Section title="Emergency">
          {emergency.address ? <EmergencyCard compact /> : <EmergencyCard />}
        </Section>
      </div>

      <FillDetailsSheet entry={justFilled} onClose={() => setJustFilled(null)} onSaved={async () => { setJustFilled(null); await reload() }} />
    </Screen>
  )
}
