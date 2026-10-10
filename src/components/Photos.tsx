import { useEffect, useRef, useState } from 'react'
import type { PhotoRow } from '../lib/database.types'
import { MAX_PHOTOS, photoUrls } from '../lib/photos'
import { Button, Spinner } from './Button'
import { Sheet } from './Sheet'

/** Picks photos with the phone camera or library. Returns File objects; the caller uploads after the entry is saved. */
export function PhotoPicker({ files, onChange, max = MAX_PHOTOS, existing = 0 }: { files: File[]; onChange: (files: File[]) => void; max?: number; existing?: number }) {
  const camRef = useRef<HTMLInputElement>(null)
  const libRef = useRef<HTMLInputElement>(null)
  const [previews, setPreviews] = useState<string[]>([])
  const room = max - existing - files.length

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f))
    setPreviews(urls)
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [files])

  function add(list: FileList | null) {
    if (!list) return
    const next = [...files, ...Array.from(list)].slice(0, max - existing)
    onChange(next)
  }

  return (
    <div>
      <span className="mb-1 block text-sm font-semibold text-clay-900">Photos</span>
      <div className="flex flex-wrap gap-2">
        {previews.map((src, i) => (
          <div key={i} className="relative h-20 w-20 overflow-hidden rounded-xl ring-1 ring-tan-300">
            <img src={src} alt="" className="h-full w-full object-cover" />
            <button type="button" aria-label="Remove photo" onClick={() => onChange(files.filter((_, j) => j !== i))} className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-ink/70 text-cream">
              ×
            </button>
          </div>
        ))}
        {room > 0 && (
          <>
            <button type="button" onClick={() => camRef.current?.click()} className="tap flex h-20 w-20 flex-col items-center justify-center rounded-xl bg-white text-xs font-semibold text-clay-900 ring-1 ring-tan-500">
              <CameraIcon />
              Camera
            </button>
            <button type="button" onClick={() => libRef.current?.click()} className="tap flex h-20 w-20 flex-col items-center justify-center rounded-xl bg-white text-xs font-semibold text-clay-900 ring-1 ring-tan-500">
              <LibraryIcon />
              Library
            </button>
          </>
        )}
      </div>
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { add(e.target.files); e.target.value = '' }} data-testid="photo-camera" />
      <input ref={libRef} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { add(e.target.files); e.target.value = '' }} data-testid="photo-library" />
      <p className="mt-1 text-xs text-ink-muted">Up to {max} per entry. Photos are shrunk before upload.</p>
    </div>
  )
}

/** Thumbnails for saved photos; tap one to view it full size. */
export function PhotoStrip({ photos, size = 'sm', onRemove }: { photos: PhotoRow[]; size?: 'sm' | 'md'; onRemove?: (p: PhotoRow) => void }) {
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  const [open, setOpen] = useState<PhotoRow | null>(null)

  useEffect(() => {
    let cancelled = false
    if (photos.length === 0) return
    photoUrls(photos.map((p) => p.storage_path)).then((m) => { if (!cancelled) setUrls(m) }).catch(() => {})
    return () => { cancelled = true }
  }, [photos])

  if (photos.length === 0) return null
  const dim = size === 'sm' ? 'h-16 w-16' : 'h-24 w-24'
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {photos.map((p) => {
          const src = urls.get(p.storage_path)
          return (
            <button key={p.id} type="button" onClick={() => setOpen(p)} className={`${dim} overflow-hidden rounded-xl bg-tan-100 ring-1 ring-tan-300`} aria-label="View photo">
              {src ? <img src={src} alt={p.caption ?? ''} className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-clay-900"><Spinner small /></span>}
            </button>
          )
        })}
      </div>
      <Sheet open={open !== null} onClose={() => setOpen(null)} title={open?.caption ?? 'Photo'}>
        {open && (
          <div className="space-y-3">
            <img src={urls.get(open.storage_path)} alt={open.caption ?? ''} className="max-h-[60dvh] w-full rounded-xl object-contain" />
            {onRemove && <Button variant="ghost" onClick={() => { onRemove(open); setOpen(null) }}>Remove photo</Button>}
          </div>
        )}
      </Sheet>
    </>
  )
}

function CameraIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  )
}
function LibraryIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M4 16l5-5 4 4 3-3 4 4" />
      <circle cx="15.5" cy="9.5" r="1.5" />
    </svg>
  )
}
