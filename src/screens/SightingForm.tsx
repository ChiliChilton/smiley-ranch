import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Button } from '../components/Button'
import { TextArea, TextInput } from '../components/Input'
import { Note } from '../components/Note'
import { PhotoPicker } from '../components/Photos'
import { PinSelect, type Where } from '../components/PinSelect'
import { Screen } from '../components/Screen'
import { friendlyError } from '../lib/errors'
import { uploadPhoto } from '../lib/photos'
import { SPECIES } from '../lib/species'
import { supabase } from '../lib/supabase'

const nowLocal = () => {
  const d = new Date()
  d.setSeconds(0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function SightingForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [species, setSpecies] = useState('Deer')
  const [other, setOther] = useState('')
  const [description, setDescription] = useState('')
  const [count, setCount] = useState('1')
  const [seenAt, setSeenAt] = useState(nowLocal())
  const [where, setWhere] = useState<Where>({ pin_id: null, lat: null, lng: null })
  const [notes, setNotes] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [existingPhotos, setExistingPhotos] = useState(0)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(!id)

  useEffect(() => {
    if (!id) return
    Promise.all([
      supabase.from('sightings').select('*').eq('id', id).single(),
      supabase.from('photos').select('id').eq('parent_type', 'sighting').eq('parent_id', id).is('deleted_at', null),
    ]).then(([{ data, error }, { data: ph }]) => {
      if (error || !data) return setError(friendlyError(error))
      const known = (SPECIES as readonly string[]).includes(data.species)
      setSpecies(known ? data.species : 'Other')
      setOther(known ? '' : data.species)
      setDescription(data.description ?? '')
      setCount(String(data.count))
      setSeenAt(data.seen_at.slice(0, 16))
      setWhere({ pin_id: data.pin_id, lat: data.lat, lng: data.lng })
      setNotes(data.notes ?? '')
      setExistingPhotos(ph?.length ?? 0)
      setLoaded(true)
    })
  }, [id])

  const finalSpecies = species === 'Other' ? other.trim() : species

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!finalSpecies) return
    setBusy(true)
    setError(null)
    try {
      const row = {
        species: finalSpecies,
        description: description.trim() || null,
        count: Math.max(1, Number(count) || 1),
        seen_at: new Date(seenAt).toISOString(),
        pin_id: where.pin_id,
        lat: where.lat,
        lng: where.lng,
        notes: notes.trim() || null,
      }
      let sightingId = id
      if (id) {
        const { error } = await supabase.from('sightings').update(row).eq('id', id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('sightings').insert(row).select('id').single()
        if (error) throw error
        sightingId = data.id
      }
      for (let i = 0; i < files.length; i++) {
        setProgress(`Uploading photo ${i + 1} of ${files.length}…`)
        await uploadPhoto(files[i], { type: 'sighting', id: sightingId!, pin_id: where.pin_id })
      }
      navigate('/sightings', { replace: true })
    } catch (err) {
      setError(friendlyError(err))
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <Screen title={id ? 'Edit sighting' : 'Saw something'} back="/sightings">
      {error && <Note kind="error" className="mb-3">{error}</Note>}
      {loaded && (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <span className="mb-1 block text-sm font-semibold text-clay-900">What</span>
            <div className="flex flex-wrap gap-2">
              {SPECIES.map((sp) => (
                <button key={sp} type="button" onClick={() => setSpecies(sp)} aria-pressed={species === sp} className={`tap rounded-full px-4 py-2 text-sm font-bold ring-1 ${species === sp ? 'bg-clay-900 text-cream ring-clay-900' : 'bg-white text-clay-950 ring-tan-500'}`}>
                  {sp}
                </button>
              ))}
            </div>
            {species === 'Other' && <div className="mt-2"><TextInput name="other" value={other} onChange={(e) => setOther(e.target.value)} placeholder="What was it?" maxLength={40} autoFocus /></div>}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <TextInput label="Looked like" name="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Big 8, sow with piglets…" maxLength={120} />
            </div>
            <TextInput label="How many" name="count" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} />
          </div>
          <TextInput label="When" name="seenAt" type="datetime-local" value={seenAt} onChange={(e) => setSeenAt(e.target.value)} required />
          <PinSelect value={where} onChange={setWhere} />
          <TextArea label="Notes" name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" rows={2} />
          <PhotoPicker files={files} onChange={setFiles} existing={existingPhotos} />
          {progress && <Note>{progress}</Note>}
          <Button type="submit" full busy={busy} disabled={!finalSpecies}>{id ? 'Save' : 'Add sighting'}</Button>
        </form>
      )}
    </Screen>
  )
}
