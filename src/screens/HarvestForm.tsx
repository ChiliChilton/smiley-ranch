import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Button } from '../components/Button'
import { TextArea, TextInput } from '../components/Input'
import { Note } from '../components/Note'
import { PinSelect, type Where } from '../components/PinSelect'
import { Screen } from '../components/Screen'
import { todayISO } from '../lib/dates'
import { friendlyError } from '../lib/errors'
import { useMembers } from '../lib/members'
import { useMe } from '../lib/session'
import { SEXES, SPECIES } from '../lib/species'
import { supabase } from '../lib/supabase'
import { createRow } from '../lib/outbox'

export function HarvestForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const me = useMe()
  const { active } = useMembers()
  const [memberId, setMemberId] = useState(me.member_id ?? '')
  const [date, setDate] = useState(todayISO())
  const [species, setSpecies] = useState('Deer')
  const [other, setOther] = useState('')
  const [sex, setSex] = useState('buck')
  const [description, setDescription] = useState('')
  const [where, setWhere] = useState<Where>({ pin_id: null, lat: null, lng: null })
  const [tag, setTag] = useState('')
  const [logged, setLogged] = useState(false)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(!id)

  useEffect(() => {
    if (!id) return
    supabase.from('harvests').select('*').eq('id', id).single().then(({ data, error }) => {
      if (error || !data) return setError(friendlyError(error))
      const known = (SPECIES as readonly string[]).includes(data.species)
      setMemberId(data.member_id)
      setDate(data.harvested_on)
      setSpecies(known ? data.species : 'Other')
      setOther(known ? '' : data.species)
      setSex(data.sex ?? 'unknown')
      setDescription(data.description ?? '')
      setWhere({ pin_id: data.pin_id, lat: data.lat, lng: data.lng })
      setTag(data.tag_number ?? '')
      setLogged(data.logged_on_license)
      setNotes(data.notes ?? '')
      setLoaded(true)
    })
  }, [id])

  const finalSpecies = species === 'Other' ? other.trim() : species
  const deerOrTurkey = species === 'Deer' || species === 'Turkey'
  const sexChoices = species === 'Deer' ? SEXES.filter((s) => ['buck', 'doe', 'unknown'].includes(s.value)) : SEXES.filter((s) => ['male', 'female', 'unknown'].includes(s.value))

  useEffect(() => {
    if (!sexChoices.some((s) => s.value === sex)) setSex(sexChoices[0].value)
  }, [species]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!finalSpecies || !memberId) return
    setBusy(true)
    setError(null)
    try {
      const row = {
        member_id: memberId,
        harvested_on: date,
        species: finalSpecies,
        sex,
        description: description.trim() || null,
        pin_id: where.pin_id,
        lat: where.lat,
        lng: where.lng,
        tag_number: tag.trim() || null,
        logged_on_license: logged,
        notes: notes.trim() || null,
      }
      if (id) {
        const { error } = await supabase.from('harvests').update(row).eq('id', id)
        if (error) throw error
      } else {
        await createRow('harvests', row)
      }
      navigate('/harvests', { replace: true })
    } catch (err) {
      setError(friendlyError(err))
      setBusy(false)
    }
  }

  return (
    <Screen title={id ? 'Edit harvest' : 'Post a harvest'} back="/harvests">
      {error && <Note kind="error" className="mb-3">{error}</Note>}
      {loaded && (
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block min-w-0">
              <span className="mb-1 block text-sm font-semibold text-clay-900">Who</span>
              <select value={memberId} onChange={(e) => setMemberId(e.target.value)} className="tap w-full rounded-md border border-tan-500 bg-white px-3 py-2.5 text-ink">
                {active.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            <TextInput label="Date" name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <span className="mb-1 block text-sm font-semibold text-clay-900">What</span>
            <div className="flex flex-wrap gap-2">
              {SPECIES.map((sp) => (
                <button key={sp} type="button" onClick={() => setSpecies(sp)} aria-pressed={species === sp} className={`tap rounded-full px-4 py-2 text-sm font-bold ring-1 ${species === sp ? 'bg-clay-900 text-cream ring-clay-900' : 'bg-white text-clay-950 ring-tan-500'}`}>
                  {sp}
                </button>
              ))}
            </div>
            {species === 'Other' && <div className="mt-2"><TextInput name="other" value={other} onChange={(e) => setOther(e.target.value)} placeholder="What was it?" maxLength={40} /></div>}
          </div>
          <div>
            <span className="mb-1 block text-sm font-semibold text-clay-900">Sex</span>
            <div className="flex flex-wrap gap-2">
              {sexChoices.map((s) => (
                <button key={s.value} type="button" onClick={() => setSex(s.value)} aria-pressed={sex === s.value} className={`tap rounded-full px-4 py-2 text-sm font-bold ring-1 ${sex === s.value ? 'bg-clay-900 text-cream ring-clay-900' : 'bg-white text-clay-950 ring-tan-500'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <TextInput label="Description or score" name="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Big 8, 140 class, 180 lb boar…" maxLength={120} />
          <PinSelect value={where} onChange={setWhere} />
          {deerOrTurkey && (
            <div className="rounded-xl bg-white p-3 ring-1 ring-tan-200">
              <div className="grid grid-cols-2 gap-3">
                <TextInput label="Tag number" name="tag" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="From your license" maxLength={40} />
                <label className="tap flex items-center gap-2 self-end pb-3">
                  <input type="checkbox" checked={logged} onChange={(e) => setLogged(e.target.checked)} className="h-6 w-6 accent-clay-900" />
                  <span className="text-sm font-semibold text-clay-950">Logged on my license</span>
                </label>
              </div>
              <p className="mt-1 text-xs text-ink-muted">Texas: tag it right away and fill in the harvest log on your license.</p>
            </div>
          )}
          <TextArea label="Notes" name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" rows={2} />
          <Button type="submit" full busy={busy} disabled={!finalSpecies || !memberId}>{id ? 'Save' : 'Post harvest'}</Button>
        </form>
      )}
    </Screen>
  )
}
