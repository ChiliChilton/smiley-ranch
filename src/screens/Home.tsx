import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { EmergencyCard } from '../components/EmergencyCard'
import { EventListRow } from '../components/EventListRow'
import { Note } from '../components/Note'
import { Screen } from '../components/Screen'
import { Sheet } from '../components/Sheet'
import type { CheckoutRow, EventRow } from '../lib/database.types'
import { fmtDateTime, todayISO } from '../lib/dates'
import { loadEvents } from '../lib/events'
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

  const reload = useCallback(async () => {
    const [ev, co] = await Promise.all([loadEvents(todayISO()).catch(() => null), loadLastCheckout()])
    if (ev) setEvents(ev.slice(0, 4))
    setLast(co)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])
  useRealtime(['events', 'checkouts'], reload)

  return (
    <Screen title={greeting(me.name)}>
      {offline && (
        <Note kind="warn" className="mb-4">
          No signal right now. Showing what we had last time.
        </Note>
      )}

      <div className="space-y-4">
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-pine-800">Coming up</h2>
            <button type="button" onClick={() => navigate('/calendar')} className="tap px-2 text-sm font-semibold text-pine-800">
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

        <p className="px-1 text-xs text-ink-muted">
          Coming in later phases: this weekend's stands, the latest log entries, feeders due, your to-dos, and low supplies.
        </p>
      </div>

      <button
        type="button"
        onClick={() => setAddOpen(true)}
        aria-label="Add"
        className="fixed right-4 z-20 flex h-16 w-16 items-center justify-center rounded-full bg-pine-900 text-cream shadow-lg active:bg-pine-800"
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
              onClick={() => { setAddOpen(false); navigate('/checkout') }}
              className="tap flex w-full items-center justify-between rounded-xl bg-white px-4 py-3 text-left text-base font-semibold text-ink ring-1 ring-tan-200 active:bg-tan-100"
            >
              I'm heading out
            </button>
          </li>
          {['Sighting', 'Log entry', 'Harvest', 'To-do', 'We need…'].map((label) => (
            <li key={label}>
              <button
                type="button"
                disabled
                className="tap flex w-full items-center justify-between rounded-xl bg-white px-4 py-3 text-left text-base font-semibold text-ink ring-1 ring-tan-200 disabled:opacity-50"
              >
                {label}
                <span className="text-xs font-medium uppercase text-ink-muted">soon</span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </Screen>
  )
}

function greeting(name: string | null) {
  const h = new Date().getHours()
  const part = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening'
  return name ? `${part}, ${name.split(' ')[0]}` : 'Back 40'
}
