import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from './Button'
import { Card } from './Card'
import { useMe } from '../lib/session'
import { emergencyFrom, emergencyText, useSettings } from '../lib/settings'
import { mapsLink, shareText, smsLink } from '../lib/share'

/** Home: the property address with Share, Maps, and 911 one tap away. */
export function EmergencyCard() {
  const { values, loading } = useSettings()
  const me = useMe()
  const navigate = useNavigate()
  const [flash, setFlash] = useState<string | null>(null)
  const info = emergencyFrom(values)
  const hasGps = Boolean(info.lat && info.lng)
  const empty = !loading && !info.address && !hasGps

  async function share() {
    const r = await shareText('Back 40 address', emergencyText(info))
    if (r === 'copied') {
      setFlash('Copied. Paste it into a text.')
      setTimeout(() => setFlash(null), 2500)
    }
  }

  return (
    <Card title="In an emergency">
      {loading ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : empty ? (
        <p className="text-sm text-ink-muted">
          The admin hasn't added the property address yet.{' '}
          {me.is_admin && (
            <button type="button" className="font-semibold text-pine-900 underline" onClick={() => navigate('/more/emergency')}>
              Add it now
            </button>
          )}
        </p>
      ) : (
        <>
          {info.address && <p className="whitespace-pre-wrap text-lg font-bold leading-snug text-pine-950">{info.address}</p>}
          {hasGps && <p className="mt-1 font-mono text-sm text-ink">{info.lat}, {info.lng}</p>}
          {info.directions && <p className="mt-2 text-sm text-ink">{info.directions}</p>}
          {info.extra && <p className="mt-2 whitespace-pre-wrap text-sm text-ink-muted">{info.extra}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={share}>Share</Button>
            <a href={smsLink(emergencyText(info))} className="tap inline-flex items-center rounded-xl bg-tan-200 px-5 py-3 font-semibold text-pine-950 active:bg-tan-300">
              Text it
            </a>
            {hasGps && (
              <a href={mapsLink(info.lat, info.lng)} target="_blank" rel="noreferrer" className="tap inline-flex items-center rounded-xl bg-tan-200 px-5 py-3 font-semibold text-pine-950 active:bg-tan-300">
                Open in Maps
              </a>
            )}
            <a href="tel:911" className="tap inline-flex items-center rounded-xl bg-alert px-5 py-3 font-semibold text-white active:opacity-90">
              Call 911
            </a>
          </div>
          {flash && <p className="mt-2 text-sm text-ok">{flash}</p>}
        </>
      )}
    </Card>
  )
}
