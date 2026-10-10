import { flushOutbox, usePendingSync } from '../lib/outbox'

/** Small pill above the tab bar while entries are waiting for signal. Tap to retry now. */
export function SyncBadge() {
  const n = usePendingSync()
  if (n === 0) return null
  return (
    <button
      type="button"
      onClick={() => void flushOutbox()}
      className="fixed left-3 z-20 flex items-center gap-2 rounded-full bg-warn/95 px-3 py-1.5 text-xs font-bold text-ink shadow"
      style={{ bottom: 'calc(var(--tab-bar-height) + var(--safe-bottom) + 12px)' }}
      aria-live="polite"
    >
      <span className="h-2 w-2 animate-pulse rounded-full bg-ink" />
      {n === 1 ? '1 entry waiting for signal' : `${n} entries waiting for signal`}
    </button>
  )
}
