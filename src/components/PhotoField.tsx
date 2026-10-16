import { useEffect, useState } from 'react'
import { photoUrl, shrinkImage } from '../lib/photos'

/**
 * "Add a photo" for a form. Picks from the camera or the roll, shrinks it on the phone, and
 * hands the parent a File to upload when the form saves. Shows the current photo if there is one.
 */
export function PhotoField({ file, onFile, existing, onClear, label = 'Photo (optional)' }: {
  file: File | null
  onFile: (f: File | null) => void
  existing?: string | null
  onClear?: () => void
  label?: string
}) {
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => {
    if (!file) { setPreview(null); return }
    let url: string | null = null
    shrinkImage(file).then((b) => { url = URL.createObjectURL(b); setPreview(url) })
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [file])
  const shown = preview ?? photoUrl(existing)
  return (
    <div>
      <span className="mb-1 block text-sm font-semibold text-clay-900">{label}</span>
      {shown ? (
        <div className="flex items-start gap-3">
          <img src={shown} alt="" className="h-24 w-24 rounded-md object-cover ring-1 ring-tan-300" />
          <div className="flex flex-col gap-2">
            <label className="tap inline-flex cursor-pointer items-center rounded-md bg-tan-200 px-3 py-2 text-sm font-semibold text-clay-950 active:bg-tan-300">
              Change
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
            </label>
            <button type="button" onClick={() => { onFile(null); onClear?.() }} className="tap text-left text-sm font-semibold text-clay-800 underline">Remove photo</button>
          </div>
        </div>
      ) : (
        <label className="tap inline-flex cursor-pointer items-center rounded-md border border-tan-500 bg-white px-3 py-2 text-sm font-semibold text-clay-950 active:bg-tan-100">
          Add a photo
          <input type="file" accept="image/*" className="sr-only" data-testid="photo-input" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
        </label>
      )}
      <p className="mt-1 text-xs text-ink-muted">Shrunk to phone size. Photos go away after a year, or sooner once there are 250.</p>
    </div>
  )
}

export function Photo({ path, className = '' }: { path: string | null | undefined; className?: string }) {
  const url = photoUrl(path)
  if (!url) return null
  return <a href={url} target="_blank" rel="noreferrer" className="block"><img src={url} alt="" loading="lazy" className={`rounded-md object-cover ring-1 ring-tan-200 ${className}`} /></a>
}
