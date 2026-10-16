// One photo per thing, kept small. The phone shrinks the picture before upload (about
// 1280px on the long side, JPEG) so 250 photos fit well inside the free 1 GB, and the app
// cleans the bucket itself: anything older than a year, or past the newest 250, is removed.
import { supabase } from './supabase'

export const PHOTO_BUCKET = 'photos'
export const MAX_PHOTOS = 250
export const KEEP_DAYS = 365
const MAX_EDGE = 1280

export async function shrinkImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return file
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.72))
  return blob ?? file
}

/** Shrinks and uploads. Returns the storage path to keep on the row. */
export async function uploadPhoto(file: File): Promise<string> {
  const blob = await shrinkImage(file)
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false })
  if (error) throw error
  return path
}

export function photoUrl(path: string | null | undefined): string | null {
  if (!path) return null
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl || null
}

export async function removePhoto(path: string | null | undefined) {
  if (!path) return
  await supabase.storage.from(PHOTO_BUCKET).remove([path])
}

const CLEANUP_KEY = 'back40.photos.cleanedAt'

/** Once a day per phone: drop photos older than a year, then anything past the newest 250. */
export async function cleanupPhotos(): Promise<number> {
  try {
    const last = Number(localStorage.getItem(CLEANUP_KEY) ?? 0)
    if (Date.now() - last < 86400000) return 0
    localStorage.setItem(CLEANUP_KEY, String(Date.now()))
  } catch { /* no storage, still try */ }
  const bucket = supabase.storage.from(PHOTO_BUCKET)
  const { data: days } = await bucket.list('', { limit: 1000, sortBy: { column: 'name', order: 'desc' } })
  const files: { path: string; created_at: string }[] = []
  for (const d of days ?? []) {
    if (!d.name || d.id) { if (d.id) files.push({ path: d.name, created_at: d.created_at ?? '' }); continue }
    const { data: inDay } = await bucket.list(d.name, { limit: 1000 })
    for (const f of inDay ?? []) files.push({ path: `${d.name}/${f.name}`, created_at: f.created_at ?? '' })
  }
  files.sort((a, b) => b.created_at.localeCompare(a.created_at))
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString()
  const doomed = files.filter((f, i) => i >= MAX_PHOTOS || f.created_at < cutoff).map((f) => f.path)
  if (doomed.length) await bucket.remove(doomed)
  return doomed.length
}
