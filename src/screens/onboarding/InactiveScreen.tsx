import { Button } from '../../components/Button'
import { Note } from '../../components/Note'
import { Centered } from '../../components/Screen'
import { useSession } from '../../lib/session'

/** The member linked to this device has been deactivated by the admin. */
export function InactiveScreen({ name }: { name: string | null }) {
  const { refresh } = useSession()
  return (
    <Centered>
      <h1 className="text-2xl font-bold text-clay-950">Access turned off</h1>
      <p className="mt-2 text-ink-muted">
        {name ? `${name}'s` : 'This'} access to Back 40 has been turned off by the admin. Your past posts are still there.
      </p>
      <Note className="mt-6">If that's a mistake, ask the admin to turn you back on, then tap below.</Note>
      <div className="mt-auto pt-6">
        <Button full onClick={() => void refresh()}>
          Try again
        </Button>
      </div>
    </Centered>
  )
}
