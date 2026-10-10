import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../components/Button'
import { Card, Divider, Row } from '../components/Card'
import { TextInput } from '../components/Input'
import { Note } from '../components/Note'
import { Screen } from '../components/Screen'
import { friendlyError } from '../lib/errors'
import { useMe, useSession } from '../lib/session'
import { isIOS, isStandalone, pushSupported } from '../lib/standalone'

export function More() {
  const me = useMe()
  const { unlockAdmin, lockAdmin } = useSession()
  const navigate = useNavigate()
  const [pinOpen, setPinOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const standalone = isStandalone()

  async function submitPin(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await unlockAdmin(pin)
      setPin('')
      setPinOpen(false)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  async function lock() {
    setBusy(true)
    try {
      await lockAdmin()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen title="More">
      <div className="space-y-4">
        <Card title="You">
          <p className="text-lg font-bold text-pine-950">{me.name}</p>
          <p className="mb-3 text-sm text-ink-muted">Everything you post shows this name.</p>
          <Button variant="secondary" onClick={() => navigate('/more/switch')}>
            Switch person
          </Button>
        </Card>

        <Card title="Admin">
          {me.is_admin ? (
            <>
              <Note kind="ok" className="mb-2">Admin mode is on for this phone.</Note>
              <Row onClick={() => navigate('/more/members')}>Members</Row>
              <Divider />
              <Row onClick={() => navigate('/more/security')}>Family code &amp; admin PIN</Row>
              <Divider />
              <Row disabled right="soon">Stands, feeders, cameras &amp; map</Row>
              <Divider />
              <Row disabled right="soon">Export data</Row>
              <div className="mt-3">
                <Button variant="secondary" busy={busy} onClick={lock}>
                  Turn off admin mode
                </Button>
              </div>
            </>
          ) : pinOpen ? (
            <form onSubmit={submitPin} className="space-y-3">
              <TextInput
                label="Admin PIN"
                name="pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                error={error}
                autoFocus
              />
              <div className="flex gap-2">
                <Button type="submit" busy={busy} disabled={pin.length < 4}>
                  Unlock
                </Button>
                <Button variant="ghost" onClick={() => { setPinOpen(false); setPin(''); setError(null) }}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <>
              <p className="mb-3 text-sm text-ink-muted">Manage members, the map, and the family code.</p>
              <Button variant="secondary" onClick={() => setPinOpen(true)}>
                Unlock admin
              </Button>
            </>
          )}
        </Card>

        <Card title="Notifications">
          {pushSupported() ? (
            <p className="text-sm text-ink-muted">Pick what you want to hear about. Coming in phase 5.</p>
          ) : isIOS() && !standalone ? (
            <p className="text-sm text-ink-muted">
              On iPhone, notifications only work once Back 40 is on your home screen.
            </p>
          ) : (
            <p className="text-sm text-ink-muted">This browser can't do notifications.</p>
          )}
        </Card>

        {!standalone && (
          <Card title="Install">
            <p className="mb-3 text-sm text-ink-muted">Put Back 40 on your home screen so it opens like an app.</p>
            <Button variant="secondary" onClick={() => navigate('/more/install')}>
              Show me how
            </Button>
          </Card>
        )}

        <p className="pt-2 text-center text-xs text-ink-muted">
          Back 40 · {standalone ? 'Installed' : 'Browser'} · v{__APP_VERSION__}
        </p>
      </div>
    </Screen>
  )
}
