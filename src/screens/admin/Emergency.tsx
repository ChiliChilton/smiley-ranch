import { useState, type FormEvent } from 'react'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { TextArea, TextInput } from '../../components/Input'
import { Note } from '../../components/Note'
import { Screen } from '../../components/Screen'
import { friendlyError } from '../../lib/errors'
import { EMERGENCY_KEYS, emergencyFrom, useSettings, type EmergencyInfo } from '../../lib/settings'

/** Admin: the address and directions everyone can send to 911 or a tow truck. */
export function Emergency() {
  const { values, loading, save } = useSettings()
  return (
    <Screen title="Emergency info" back="/info">
      <p className="mb-4 text-sm text-ink-muted">Shows on Home and on Ranch info with a Share button, so anyone can text it to 911, a tow truck, or a late guest.</p>
      {!loading && <EmergencyForm initial={emergencyFrom(values)} initialBeds={values?.beds ?? '4'} save={save} />}
    </Screen>
  )
}

function EmergencyForm({ initial, initialBeds, save }: { initial: EmergencyInfo; initialBeds: string; save: (entries: Record<string, string>) => Promise<void> }) {
  const [form, setForm] = useState<EmergencyInfo>(initial)
  const [beds, setBeds] = useState(initialBeds)
  const [busy, setBusy] = useState(false)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const set = (k: keyof EmergencyInfo) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setDone(false)
    try {
      await save({ ...Object.fromEntries((Object.keys(EMERGENCY_KEYS) as (keyof EmergencyInfo)[]).map((k) => [EMERGENCY_KEYS[k], form[k].trim()])), beds: beds || '4' })
      setDone(true)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) return setError("This phone can't share its location.")
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({ ...f, lat: pos.coords.latitude.toFixed(5), lng: pos.coords.longitude.toFixed(5) }))
        setLocating(false)
      },
      () => {
        setError("Couldn't get your location. Check Location Services for Smiley Ranch.")
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  return (
        <form onSubmit={submit} className="space-y-4">
          <Card>
            <div className="space-y-3">
              <TextArea label="911 address" name="address" value={form.address} onChange={set('address')} placeholder="1234 County Road 100, Llano, TX 78643" rows={2} />
              <TextArea label="How to find the gate" name="directions" value={form.directions} onChange={set('directions')} placeholder="2 miles north of FM 152, green pipe gate on the left…" />
            </div>
          </Card>
          <Card title="GPS">
            <div className="grid grid-cols-2 gap-3">
              <TextInput label="Latitude" name="lat" inputMode="decimal" value={form.lat} onChange={set('lat')} placeholder="30.7560" />
              <TextInput label="Longitude" name="lng" inputMode="decimal" value={form.lng} onChange={set('lng')} placeholder="-98.6745" />
            </div>
            <div className="mt-3">
              <Button variant="secondary" busy={locating} onClick={useMyLocation}>Use my location</Button>
              <p className="mt-1 text-sm text-ink-muted">Stand at the cabin or the gate and tap that.</p>
            </div>
          </Card>
          <Card>
            <TextArea label="Anything else" name="extra" value={form.extra} onChange={set('extra')} placeholder="Nearest ER, sheriff's number, neighbor who has a key…" />
          </Card>
          <Card title="The place">
            <TextInput label="How many beds" name="beds" inputMode="numeric" value={beds} onChange={(e) => setBeds(e.target.value.replace(/\D/g, ''))} hint="Shown on trips next to the headcount." />
          </Card>
          {error && <Note kind="error">{error}</Note>}
          {done && <Note kind="ok">Saved.</Note>}
          <Button type="submit" full busy={busy}>Save</Button>
        </form>
  )
}
