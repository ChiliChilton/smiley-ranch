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
import { DEMO, DEMO_PIN } from '../lib/demo'
import { demoOffline, resetDemo, setDemoOffline } from '../lib/demo/mockClient'
import { flushOutbox } from '../lib/outbox'

export function More() {
  const me = useMe()
  const { unlockAdmin, lockAdmin } = useSession()
  const navigate = useNavigate()
  const [pinOpen, setPinOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(() => demoOffline())
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
          <p className="text-lg font-bold text-clay-950">{me.name}</p>
          <p className="mb-3 text-sm text-ink-muted">Everything you post shows this name.</p>
          <Button variant="secondary" onClick={() => navigate('/more/switch')}>
            Switch person
          </Button>
        </Card>

        <Card title="The place">
          <Row onClick={() => navigate('/feeders')}>Feeders</Row>
          <Divider />
          <Row onClick={() => navigate('/harvests')}>Harvests</Row>
          <Divider />
          <Row onClick={() => navigate('/log')}>Property notes</Row>
          <Divider />
          <Row onClick={() => navigate('/stands')}>Stands</Row>
          <Divider />
          <Row onClick={() => navigate('/map')}>Map</Row>
          <Divider />
          <Row onClick={() => navigate('/checkout')}>Before you leave</Row>
        </Card>

        <Card title="Admin">
          {me.is_admin ? (
            <>
              <Note kind="ok" className="mb-2">Admin mode is on for this phone.</Note>
              <Row onClick={() => navigate('/more/members')}>Members</Row>
              <Divider />
              <Row onClick={() => navigate('/more/security')}>Family code &amp; admin PIN</Row>
              <Divider />
              <Row onClick={() => navigate('/more/checklist')}>Check-out list</Row>
              <Divider />
              <Row onClick={() => navigate('/more/seasons')}>Hunting seasons</Row>
              <Divider />
              <Row onClick={() => navigate('/more/emergency')}>Emergency info</Row>
              <Divider />
              <Row onClick={() => navigate('/map')}>Stands, feeders, cameras &amp; map</Row>
              <Divider />
              <Row onClick={() => navigate('/more/export')}>Export data</Row>
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
              <p className="mb-3 text-sm text-ink-muted">Manage members, the map, and the family code.{DEMO && ` Demo PIN: ${DEMO_PIN}.`}</p>
              <Button variant="secondary" onClick={() => setPinOpen(true)}>
                Unlock admin
              </Button>
            </>
          )}
        </Card>

        <Card title="Notifications">
          {pushSupported() ? (
            <>
              <p className="mb-3 text-sm text-ink-muted">Pick what you want to hear about.</p>
              <Button variant="secondary" onClick={() => navigate('/more/notifications')}>Notification settings</Button>
            </>
          ) : isIOS() && !standalone ? (
            <p className="text-sm text-ink-muted">
              On iPhone, notifications only work once Smiley Ranch is on your home screen.
            </p>
          ) : (
            <p className="text-sm text-ink-muted">This browser can't do notifications.</p>
          )}
        </Card>

        {!standalone && (
          <Card title="Install">
            <p className="mb-3 text-sm text-ink-muted">Put Smiley Ranch on your home screen so it opens like an app.</p>
            <Button variant="secondary" onClick={() => navigate('/more/install')}>
              Show me how
            </Button>
          </Card>
        )}

        {DEMO && (
          <Card title="Demo">
            <p className="mb-3 text-sm text-ink-muted">
              Sample data lives only on this device. Satellite imagery, GPS, and notifications are off in the demo. Everything else works.
            </p>
            <label className="tap mb-3 flex items-center gap-3">
              <input type="checkbox" checked={offline} onChange={(e) => { setDemoOffline(e.target.checked); setOffline(e.target.checked); if (!e.target.checked) void flushOutbox() }} className="h-6 w-6 accent-clay-900" />
              <span className="text-sm font-semibold text-clay-950">Pretend there's no signal</span>
            </label>
            <p className="mb-3 text-xs text-ink-muted">With this on, new entries wait in the outbox and a badge shows how many. Turn it off and they send.</p>
            <Button variant="secondary" onClick={() => { resetDemo(); window.location.reload() }}>Reset demo data</Button>
          </Card>
        )}

        <p className="pt-2 text-center text-xs text-ink-muted">
          Smiley Ranch · {standalone ? 'Installed' : 'Browser'} · v{__APP_VERSION__}
        </p>
      </div>
    </Screen>
  )
}
