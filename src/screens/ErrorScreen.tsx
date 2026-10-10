import { Button } from '../components/Button'
import { Note } from '../components/Note'
import { Centered } from '../components/Screen'

export function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Centered>
      <div className="mb-6 flex items-center gap-3">
        <img src="/icons/icon-192.png" alt="" width={56} height={56} className="rounded-xl" />
        <h1 className="text-2xl font-bold text-pine-950">Back 40</h1>
      </div>
      <Note kind="error">{message}</Note>
      <div className="mt-auto pt-6">
        <Button full onClick={onRetry}>
          Try again
        </Button>
      </div>
    </Centered>
  )
}

export function LoadingScreen() {
  return (
    <Centered>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-pine-900">
        <img src="/icons/icon-192.png" alt="" width={72} height={72} className="rounded-2xl" />
        <span className="text-ink-muted">Loading…</span>
      </div>
    </Centered>
  )
}
