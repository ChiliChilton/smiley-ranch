import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button, Spinner } from '../components/Button'
import { Card } from '../components/Card'
import { EventListRow } from '../components/EventListRow'
import { Note } from '../components/Note'
import { Screen } from '../components/Screen'
import type { EventRow } from '../lib/database.types'
import { addDays, fmtDate, monthGrid, monthName, overlaps, todayISO, WEEKDAYS_SHORT } from '../lib/dates'
import { friendlyError } from '../lib/errors'
import { KIND, KIND_ORDER, loadEvents } from '../lib/events'
import { useRealtime } from '../lib/realtime'

export function Calendar() {
  const navigate = useNavigate()
  const today = todayISO()
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [selected, setSelected] = useState<string | null>(null)
  const [events, setEvents] = useState<EventRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setEvents(await loadEvents(addDays(today, -400)))
    } catch (err) {
      setError(friendlyError(err))
    }
  }, [today])

  useEffect(() => {
    void reload()
  }, [reload])
  useRealtime(['events', 'event_attendees'], reload)

  const grid = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor])
  const monthPrefix = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`

  const byDay = useMemo(() => {
    const map = new Map<string, EventRow[]>()
    if (!events) return map
    for (const row of grid.flat()) {
      const hits = events.filter((e) => overlaps(e.starts_on, e.ends_on, row, row))
      if (hits.length) map.set(row, hits)
    }
    return map
  }, [events, grid])

  const listed = useMemo(() => {
    if (!events) return []
    if (selected) return events.filter((e) => overlaps(e.starts_on, e.ends_on, selected, selected))
    return events.filter((e) => e.ends_on >= today).slice(0, 30)
  }, [events, selected, today])

  function move(n: number) {
    setSelected(null)
    setCursor(({ year, month }) => {
      const d = new Date(year, month + n, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  return (
    <Screen
      title="Calendar"
      right={
        <button
          type="button"
          onClick={() => navigate('/calendar/new' + (selected ? `?date=${selected}` : ''))}
          className="tap flex items-center gap-1 rounded-lg px-3 font-semibold active:bg-pine-800"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add
        </button>
      }
    >
      {error && <Note kind="error" className="mb-3">{error}</Note>}

      <Card className="mb-4 !p-3">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" onClick={() => move(-1)} aria-label="Previous month" className="tap flex items-center justify-center rounded-lg text-pine-900 active:bg-tan-100">
            <Arrow dir="left" />
          </button>
          <button
            type="button"
            onClick={() => { const d = new Date(); setCursor({ year: d.getFullYear(), month: d.getMonth() }); setSelected(today) }}
            className="tap px-2 text-lg font-bold text-pine-950"
          >
            {monthName(cursor.year, cursor.month)}
          </button>
          <button type="button" onClick={() => move(1)} aria-label="Next month" className="tap flex items-center justify-center rounded-lg text-pine-900 active:bg-tan-100">
            <Arrow dir="right" />
          </button>
        </div>

        <div className="grid grid-cols-7 text-center text-xs font-semibold text-ink-muted">
          {WEEKDAYS_SHORT.map((d, i) => (
            <div key={i} className="py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {grid.flat().map((iso) => {
            const inMonth = iso.startsWith(monthPrefix)
            const hits = byDay.get(iso) ?? []
            const isToday = iso === today
            const isSel = iso === selected
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setSelected(isSel ? null : iso)}
                aria-label={fmtDate(iso) + (hits.length ? `, ${hits.length} on the calendar` : '')}
                aria-pressed={isSel}
                className={`flex h-14 flex-col items-center rounded-lg pt-1 ${isSel ? 'bg-pine-900 text-cream' : inMonth ? 'text-ink active:bg-tan-100' : 'text-ink-muted/50'}`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                    isToday && !isSel ? 'bg-tan-300 text-pine-950' : ''
                  }`}
                >
                  {Number(iso.slice(8))}
                </span>
                <span className="mt-0.5 flex w-9 flex-col gap-0.5">
                  {hits.slice(0, 3).map((e) => (
                    <span key={e.id} className={`h-1.5 rounded-sm ${isSel ? 'bg-cream/80' : KIND[e.kind].bar}`} />
                  ))}
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
          {KIND_ORDER.map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={`inline-block h-2 w-5 rounded-sm ${KIND[k].bar}`} />
              {KIND[k].label}
            </span>
          ))}
        </div>
      </Card>

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-pine-800">
          {selected ? fmtDate(selected) : 'Coming up'}
        </h2>
        {selected && (
          <Button variant="ghost" className="!min-h-0 !py-1 text-sm" onClick={() => setSelected(null)}>
            Show all
          </Button>
        )}
      </div>

      {!events ? (
        <div className="flex justify-center py-8 text-pine-900"><Spinner /></div>
      ) : listed.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-muted">{selected ? 'Nothing on this day.' : 'Nothing coming up.'}</p>
          <div className="mt-3">
            <Button variant="secondary" onClick={() => navigate('/calendar/new' + (selected ? `?date=${selected}` : ''))}>
              Add to the calendar
            </Button>
          </div>
        </Card>
      ) : (
        <ul className="space-y-2">
          {listed.map((e) => (
            <EventListRow key={e.id} event={e} onClick={() => navigate(`/calendar/${e.id}`)} />
          ))}
        </ul>
      )}
    </Screen>
  )
}

function Arrow({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d={dir === 'left' ? 'M12 4l-6 6 6 6' : 'M8 4l6 6-6 6'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
