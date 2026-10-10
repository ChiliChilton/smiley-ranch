import { useState } from 'react'
import { Card } from '../components/Card'
import { Note } from '../components/Note'
import { Screen } from '../components/Screen'
import { Sheet } from '../components/Sheet'
import { useMe, useSession } from '../lib/session'

/**
 * Home / Today. Phase 1 lays out the sections; Phases 2-4 fill them with
 * stand assignments, log entries, feeders, to-dos, and supplies.
 */
export function Home() {
  const me = useMe()
  const session = useSession()
  const offline = session.status === 'ready' && session.offline
  const [addOpen, setAddOpen] = useState(false)

  return (
    <Screen title={greeting(me.name)}>
      {offline && (
        <Note kind="warn" className="mb-4">
          No signal right now. Showing what we had last time.
        </Note>
      )}

      <div className="space-y-4">
        <Card title="This weekend's stands">
          <Soon>Stand sign-up arrives in the next phase.</Soon>
        </Card>
        <Card title="Latest on the place">
          <Soon>The log shows the last 5 entries here.</Soon>
        </Card>
        <Card title="Feeders due">
          <Soon>Overdue feeders show up here in yellow and red.</Soon>
        </Card>
        <Card title="My to-dos">
          <Soon>Open to-dos assigned to you.</Soon>
        </Card>
        <Card title="Running low">
          <Soon>Low supplies and the shopping list.</Soon>
        </Card>
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

function Soon({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-ink-muted">{children}</p>
}

function greeting(name: string | null) {
  const h = new Date().getHours()
  const part = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening'
  return name ? `${part}, ${name.split(' ')[0]}` : 'Back 40'
}
