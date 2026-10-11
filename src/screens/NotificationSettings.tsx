import { useCallback, useEffect, useState } from 'react'
import { Button, Spinner } from '../components/Button'
import { Card } from '../components/Card'
import { Note } from '../components/Note'
import { Screen } from '../components/Screen'
import type { PushPrefs } from '../lib/database.types'
import { DEMO } from '../lib/demo'
import { friendlyError } from '../lib/errors'
import { defaultPrefs, disablePush, enablePush, loadMyPushRow, PREF_LABELS, pushConfigured, savePrefs } from '../lib/push'
import { useMe } from '../lib/session'
import { isIOS, isStandalone, pushSupported } from '../lib/standalone'

/** Per-person notification choices. The subscription lives on this phone; prefs live with it. */
export function NotificationSettings() {
  const me = useMe()
  const supported = pushSupported()
  const [loading, setLoading] = useState(true)
  const [endpoint, setEndpoint] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<PushPrefs>(defaultPrefs(me.is_admin))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const { sub, row } = await loadMyPushRow()
      setEndpoint(sub && row ? sub.endpoint : null)
      if (row) setPrefs({ ...defaultPrefs(me.is_admin), ...row.prefs })
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }, [me.is_admin])
  useEffect(() => { void reload() }, [reload])

  async function turnOn() {
    if (!me.member_id) return
    setBusy(true); setError(null)
    try { await enablePush(me.member_id, prefs); await reload() } catch (err) { setError(friendlyError(err)) } finally { setBusy(false) }
  }
  async function turnOff() {
    setBusy(true); setError(null)
    try { await disablePush(); await reload() } catch (err) { setError(friendlyError(err)) } finally { setBusy(false) }
  }
  async function toggle(key: keyof PushPrefs) {
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    if (endpoint) {
      try { await savePrefs(endpoint, next) } catch (err) { setError(friendlyError(err)) }
    }
  }

  return (
    <Screen title="Notifications" back="/more">
      {error && <Note kind="error" className="mb-3">{error}</Note>}
      {DEMO && <Note className="mb-3">Demo: notifications can't be sent from this page. In the real app this is where you pick what you get.</Note>}
      {!supported ? (
        <Note kind="warn">
          {isIOS() && !isStandalone()
            ? 'On iPhone, notifications only work once Smiley Ranch is on your home screen. Add it, open it from there, and come back here.'
            : "This browser can't do notifications."}
        </Note>
      ) : !pushConfigured && !DEMO ? (
        <Note kind="warn">Notifications aren't set up on the server yet. The admin needs to add the VAPID key (see README).</Note>
      ) : loading ? (
        <div className="flex justify-center py-8 text-clay-900"><Spinner /></div>
      ) : (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="font-bold text-clay-950">{endpoint ? 'On for this phone' : 'Off'}</div>
              <div className="text-sm text-ink-muted">{endpoint ? 'Pick what you want below.' : 'Turn on, then pick what you want.'}</div>
            </div>
            {endpoint ? (
              <Button variant="secondary" busy={busy} onClick={turnOff}>Turn off</Button>
            ) : (
              <Button busy={busy} onClick={turnOn}>Turn on</Button>
            )}
          </div>
          <ul className="divide-y divide-tan-200">
            {PREF_LABELS.map((p) => (
              <li key={p.key}>
                <label className="tap flex items-center gap-3 py-3">
                  <input type="checkbox" checked={prefs[p.key]} onChange={() => toggle(p.key)} className="h-6 w-6 shrink-0 accent-clay-900" />
                  <span className="min-w-0">
                    <span className="block font-semibold text-clay-950">{p.label}</span>
                    <span className="block text-sm text-ink-muted">{p.hint}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Screen>
  )
}
