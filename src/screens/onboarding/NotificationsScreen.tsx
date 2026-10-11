import { useState } from 'react'
import { Button } from '../../components/Button'
import { Note } from '../../components/Note'
import { Centered } from '../../components/Screen'
import { isIOS, isStandalone, pushSupported } from '../../lib/standalone'
import { defaultPrefs, enablePush, pushConfigured } from '../../lib/push'
import { useMe } from '../../lib/session'

/**
 * Optional step after joining. Phase 1 only asks the browser for permission.
 * Phase 5 adds the actual push subscription and per-person choices.
 */
export function NotificationsScreen({ onDone }: { onDone: () => void }) {
  const me = useMe()
  const supported = pushSupported() && pushConfigured
  const [result, setResult] = useState<NotificationPermission | null>(null)
  const [busy, setBusy] = useState(false)

  async function allow() {
    setBusy(true)
    try {
      if (me.member_id) await enablePush(me.member_id, defaultPrefs(me.is_admin))
      setResult('granted')
      onDone()
    } catch {
      setResult(Notification.permission === 'denied' ? 'denied' : 'default')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Centered>
      <h1 className="text-2xl font-bold text-clay-950">Notifications</h1>
      <p className="mb-4 text-ink-muted">Optional. You pick what you get, later in Settings.</p>

      <ul className="mb-6 space-y-2 rounded-2xl bg-white p-4 ring-1 ring-tan-200 text-ink">
        <li>• Someone claimed or released a stand this weekend</li>
        <li>• A new harvest was posted</li>
        <li>• A to-do was assigned to you</li>
        <li>• A new event was added to the calendar</li>
      </ul>

      {!supported && isIOS() && !isStandalone() && (
        <Note kind="warn" className="mb-4">
          On iPhone, notifications only work after you add Smiley Ranch to your home screen. You can turn them on from Settings once it's installed.
        </Note>
      )}
      {!supported && !(isIOS() && !isStandalone()) && (
        <Note className="mb-4">This browser can't do notifications. You can still use everything else.</Note>
      )}
      {result === 'denied' && (
        <Note kind="warn" className="mb-4">
          Notifications are blocked. You can turn them on later in your phone's Settings for Smiley Ranch.
        </Note>
      )}

      <div className="mt-auto space-y-2 pt-6">
        {supported && result !== 'denied' && (
          <Button full busy={busy} onClick={allow}>
            Turn on notifications
          </Button>
        )}
        <Button variant="ghost" full onClick={onDone}>
          {supported ? 'Not now' : 'Continue'}
        </Button>
      </div>
    </Centered>
  )
}
