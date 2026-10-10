import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { EmergencyCard } from '../components/EmergencyCard'
import { EventListRow } from '../components/EventListRow'
import { Note } from '../components/Note'
import { Screen } from '../components/Screen'
import { Sheet } from '../components/Sheet'
import { loadClaims, SIT_LABEL, weekendDates } from '../lib/claims'
import type { CheckoutRow, EventRow, FeederFillRow, PinRow, StandClaimRow } from '../lib/database.types'
import { feederStatus, loadFeeders, recordFill } from '../lib/feeders'
import { FeederCard, FillDetailsSheet } from './Feeders'
import { CheckinCard } from '../components/CheckinCard'
import { loadLog } from './Log'
import { loadMyOpenTodos } from './Todos'
import { loadSupplies } from './Supplies'
import type { LogEntryRow, SupplyItemRow, TodoRow } from '../lib/database.types'
import { fmtDate, fmtDateTime, todayISO } from '../lib/dates'
import { loadEvents } from '../lib/events'
import { supabase } from '../lib/supabase'
import { useMembers } from '../lib/members'
import { useRealtime } from '../lib/realtime'
import { useMe, useSession } from '../lib/session'
import { loadLastCheckout } from './Checkout'

/** Home / Today. */
export function Home() {
  const me = useMe()
  const session = useSession()
  const navigate = useNavigate()
  const { nameOf } = useMembers()
  const offline = session.status === 'ready' && session.offline
  const [addOpen, setAddOpen] = useState(false)
  const [events, setEvents] = useState<EventRow[] | null>(null)
  const [last, setLast] = useState<CheckoutRow | null>(null)
  const [weekend, setWeekend] = useState<{ days: string[]; claims: StandClaimRow[]; stands: PinRow[] } | null>(null)
  const [feeders, setFeeders] = useState<{ feeders: PinRow[]; lastFill: Map<string, FeederFillRow> } | null>(null)
  const [log, setLog] = useState<LogEntryRow[]>([])
  const [todos, setTodos] = useState<TodoRow[]>([])
  const [needs, setNeeds] = useState<SupplyItemRow[]>([])
  const [justFilled, setJustFilled] = useState<{ feeder: PinRow; fill: FeederFillRow } | null>(null)

  const reload = useCallback(async () => {
    const days = weekendDates()
    const [ev, co, cl, st, fd, lg, td, sp] = await Promise.all([
      loadEvents(todayISO()).catch(() => null),
      loadLastCheckout(),
      days.length ? loadClaims(days[0], days[days.length - 1]).catch(() => []) : Promise.resolve([]),
      supabase.from('pins').select('*').eq('type', 'stand').is('deleted_at', null).then((r) => r.data ?? []),
      loadFeeders().catch(() => null),
      loadLog(5).catch(() => []),
      me.member_id ? loadMyOpenTodos(me.member_id).catch(() => []) : Promise.resolve([]),
      loadSupplies().catch(() => []),
    ])
    if (ev) setEvents(ev.slice(0, 4))
    setLast(co)
    setWeekend({ days, claims: cl, stands: st })
    setFeeders(fd)
    setLog(lg)
    setTodos(td)
    setNeeds(sp.filter((i) => i.needed))
  }, [me.member_id])

  useEffect(() => {
    void reload()
  }, [reload])
  useRealtime(['events', 'checkouts', 'stand_claims', 'feeder_fills', 'log_entries', 'todos', 'supply_items'], reload)

  const feedersDue = (feeders?.feeders ?? []).filter((f) => ['due', 'overdue'].includes(feederStatus(f, feeders!.lastFill.get(f.id)).status))

  return (
    <Screen title={greeting(me.name)}>
      {offline && (
        <Note kind="warn" className="mb-4">
          No signal right now. Showing what we had last time.
        </Note>
      )}

      <div className="space-y-4">
        <CheckinCard />

        <Card title="This weekend's stands">
          {!weekend ? (
            <p className="text-sm text-ink-muted">Loading…</p>
          ) : weekend.claims.length === 0 ? (
            <p className="text-sm text-ink-muted">Nobody has claimed a stand yet.</p>
          ) : (
            <div className="space-y-2">
              {weekend.days.map((d) => {
                const dayClaims = weekend.claims.filter((c) => c.date === d)
                if (dayClaims.length === 0) return null
                return (
                  <div key={d}>
                    <div className="text-sm font-bold text-clay-950">{fmtDate(d)}</div>
                    {(['am', 'pm'] as const).map((sit) => {
                      const list = dayClaims.filter((c) => c.sit === sit)
                      if (list.length === 0) return null
                      return (
                        <div key={sit} className="flex gap-2 text-sm text-ink">
                          <span className="w-8 shrink-0 font-semibold text-ink-muted">{SIT_LABEL[sit]}</span>
                          <span>{list.map((c) => `${weekend.stands.find((s) => s.id === c.stand_id)?.name ?? 'Stand'} · ${nameOf(c.member_id)}`).join(', ')}</span>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
          <div className="mt-3">
            <Button variant="secondary" onClick={() => navigate('/stands')}>Claim a stand</Button>
          </div>
        </Card>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-clay-800">Coming up</h2>
            <button type="button" onClick={() => navigate('/calendar')} className="tap px-2 text-sm font-semibold text-clay-800">
              Calendar
            </button>
          </div>
          {events && events.length === 0 ? (
            <Card>
              <p className="text-sm text-ink-muted">Nothing on the calendar yet.</p>
              <div className="mt-3">
                <Button variant="secondary" onClick={() => navigate('/calendar/new')}>Add a trip or work day</Button>
              </div>
            </Card>
          ) : (
            <ul className="space-y-2">
              {(events ?? []).map((e) => (
                <EventListRow key={e.id} event={e} compact onClick={() => navigate(`/calendar/${e.id}`)} />
              ))}
            </ul>
          )}
        </section>

        {feedersDue.length > 0 && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wide text-clay-800">Feeders due</h2>
              <button type="button" onClick={() => navigate('/feeders')} className="tap px-2 text-sm font-semibold text-clay-800">All feeders</button>
            </div>
            <ul className="space-y-2">
              {feedersDue.map((f) => (
                <li key={f.id}>
                  <FeederCard
                    feeder={f}
                    fill={feeders!.lastFill.get(f.id)}
                    compact
                    onFilled={async () => { const fill = await recordFill(f.id); setJustFilled({ feeder: f, fill }); await reload() }}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        <Card title="Latest on the place">
          {log.length === 0 ? (
            <p className="text-sm text-ink-muted">Nothing in the log yet.</p>
          ) : (
            <ul className="space-y-2">
              {log.map((e) => (
                <li key={e.id} className="text-sm">
                  <span className="text-ink">{e.body.length > 140 ? e.body.slice(0, 140) + '…' : e.body}</span>
                  <span className="block text-xs text-ink-muted">{nameOf(e.created_by)} · {fmtDateTime(e.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3"><Button variant="secondary" onClick={() => navigate('/log')}>Open the log</Button></div>
        </Card>

        {todos.length > 0 && (
          <Card title="My to-dos">
            <ul className="space-y-1 text-sm">
              {todos.map((t) => (
                <li key={t.id} className="text-ink">
                  • {t.title}
                  {t.due_on && <span className={t.due_on < todayISO() ? ' font-semibold text-alert' : ' text-ink-muted'}> · {t.due_on < todayISO() ? 'was due' : 'due'} {fmtDate(t.due_on)}</span>}
                </li>
              ))}
            </ul>
            <div className="mt-3"><Button variant="secondary" onClick={() => navigate('/todos')}>All to-dos</Button></div>
          </Card>
        )}

        {needs.length > 0 && (
          <Card title="We need">
            <p className="text-sm text-ink">{needs.slice(0, 6).map((i) => i.name).join(', ')}{needs.length > 6 ? ` and ${needs.length - 6} more` : ''}</p>
            <div className="mt-3"><Button variant="secondary" onClick={() => navigate('/supplies')}>Shopping list</Button></div>
          </Card>
        )}

        <EmergencyCard />

        <Card title="Before you leave">
          {last ? (
            <p className="text-sm text-ink">
              Last out: <strong>{nameOf(last.member_id)}</strong>, {fmtDateTime(last.left_at)}
              {last.all_done ? '. All done.' : `. Skipped ${last.items.filter((i) => !i.done).length}.`}
              {last.notes && <span className="block text-ink-muted">“{last.notes}”</span>}
            </p>
          ) : (
            <p className="text-sm text-ink-muted">Nobody has checked out yet.</p>
          )}
          <div className="mt-3">
            <Button variant="secondary" onClick={() => navigate('/checkout')}>Heading out? Open the list</Button>
          </div>
        </Card>

        <p className="px-1 text-xs text-ink-muted">Coming in the last phase: notifications, posting with no signal, and export.</p>
      </div>

      <button
        type="button"
        onClick={() => setAddOpen(true)}
        aria-label="Add"
        className="fixed right-4 z-20 flex h-16 w-16 items-center justify-center rounded-full bg-clay-900 text-cream shadow-lg active:bg-clay-800"
        style={{ bottom: 'calc(var(--tab-bar-height) + var(--safe-bottom) + 16px)' }}
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Add">
        <ul className="space-y-2">
          <li>
            <button
              type="button"
              onClick={() => { setAddOpen(false); navigate('/calendar/new') }}
              className="tap flex w-full items-center justify-between rounded-xl bg-white px-4 py-3 text-left text-base font-semibold text-ink ring-1 ring-tan-200 active:bg-tan-100"
            >
              Trip, work day, or date
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => { setAddOpen(false); navigate('/stands') }}
              className="tap flex w-full items-center justify-between rounded-xl bg-white px-4 py-3 text-left text-base font-semibold text-ink ring-1 ring-tan-200 active:bg-tan-100"
            >
              Claim a stand
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => { setAddOpen(false); navigate('/map?drop=1') }}
              className="tap flex w-full items-center justify-between rounded-xl bg-white px-4 py-3 text-left text-base font-semibold text-ink ring-1 ring-tan-200 active:bg-tan-100"
            >
              Pin at my location
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => { setAddOpen(false); navigate('/checkout') }}
              className="tap flex w-full items-center justify-between rounded-xl bg-white px-4 py-3 text-left text-base font-semibold text-ink ring-1 ring-tan-200 active:bg-tan-100"
            >
              I'm heading out
            </button>
          </li>
          {([['Log entry', '/log'], ['To-do', '/todos/new'], ['We need…', '/supplies'], ['Saw something', '/sightings/new'], ['Post a harvest', '/harvests/new'], ['Filled a feeder', '/feeders']] as const).map(([label, to]) => (
            <li key={to}>
              <button
                type="button"
                onClick={() => { setAddOpen(false); navigate(to) }}
                className="tap flex w-full items-center justify-between rounded-xl bg-white px-4 py-3 text-left text-base font-semibold text-ink ring-1 ring-tan-200 active:bg-tan-100"
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
      <FillDetailsSheet entry={justFilled} onClose={() => setJustFilled(null)} onSaved={async () => { setJustFilled(null); await reload() }} />
    </Screen>
  )
}

function greeting(name: string | null) {
  const h = new Date().getHours()
  const part = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening'
  return name ? `${part}, ${name.split(' ')[0]}` : 'Back 40'
}
