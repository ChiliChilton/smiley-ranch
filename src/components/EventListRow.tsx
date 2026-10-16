import type { EventRow } from '../lib/database.types'
import { fmtRange, relativeDay, todayISO } from '../lib/dates'
import { KIND } from '../lib/events'
import { useMembers } from '../lib/members'

export function KindBadge({ kind, mine }: { kind: EventRow['kind']; mine?: boolean }) {
  const label = kind === 'exclusive' && mine ? 'Just us' : KIND[kind].label
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold ${KIND[kind].badge}`}>
      {kind === 'exclusive' ? (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
      ) : kind === 'inclusive' ? (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
      ) : null}
      {label}
    </span>
  )
}

export function EventListRow({ event, onClick, compact }: { event: EventRow; onClick: () => void; compact?: boolean }) {
  const { nameOf } = useMembers()
  const today = todayISO()
  const live = event.starts_on <= today && event.ends_on >= today
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`tap flex w-full items-stretch gap-3 rounded-2xl bg-white text-left ring-1 ring-tan-200 active:bg-tan-100 ${compact ? 'p-3' : 'p-4'}`}
      >
        <span className={`w-1.5 shrink-0 rounded-full ${KIND[event.kind].bar}`} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-bold text-clay-950">{event.title}</span>
            <KindBadge kind={event.kind} />
          </span>
          <span className="block text-sm text-ink">
            {fmtRange(event.starts_on, event.ends_on)}
            <span className="text-ink-muted"> · {live ? 'now' : relativeDay(event.starts_on)}</span>
          </span>
          {!compact && (
            <span className="block text-sm text-ink-muted">
              {event.kind === 'exclusive' ? `${nameOf(event.created_by)} has the place` : `Added by ${nameOf(event.created_by)}`}
            </span>
          )}
        </span>
      </button>
    </li>
  )
}
