import type { PhotoParent, PhotoRow } from './database.types'
import { supabase } from './supabase'

export const MAX_PHOTOS = 5
const MAX_EDGE = 1600
const BUCKET = 'photos'

/** Shrink a camera photo to ~1600px on the long side as JPEG, honoring EXIF rotation where the browser can. */
export async function compressImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  let bitmap: ImageBitmap | HTMLImageElement
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = URL.createObjectURL(file)
    })
  }
  const w0 = 'naturalWidth' in bitmap ? bitmap.naturalWidth : bitmap.width
  const h0 = 'naturalHeight' in bitmap ? bitmap.naturalHeight : bitmap.height
  const scale = Math.min(1, MAX_EDGE / Math.max(w0, h0))
  const width = Math.round(w0 * scale)
  const height = Math.round(h0 * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height)
  if ('close' in bitmap) bitmap.close()
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode photo'))), 'image/jpeg', 0.82))
  return { blob, width, height }
}

/** Compress, upload to Storage, and record the photo row. */
export async function uploadPhoto(file: File, parent: { type: PhotoParent; id: string; pin_id?: string | null }): Promise<PhotoRow> {
  const { blob, width, height } = await compressImage(file)
  const id = crypto.randomUUID()
  const storage_path = `${parent.type}/${parent.id}/${id}.jpg`
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(storage_path, blob, { contentType: 'image/jpeg', upsert: false })
  if (upErr) throw upErr
  const { data, error } = await supabase
    .from('photos')
    .insert({ id, parent_type: parent.type, parent_id: parent.id, storage_path, width, height, pin_id: parent.pin_id ?? null })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function loadPhotosFor(type: PhotoParent, ids: string[]): Promise<Map<string, PhotoRow[]>> {
  const map = new Map<string, PhotoRow[]>()
  if (ids.length === 0) return map
  const { data, error } = await supabase.from('photos').select('*').eq('parent_type', type).in('parent_id', ids).is('deleted_at', null).order('created_at')
  if (error) throw error
  for (const p of data ?? []) {
    const list = map.get(p.parent_id) ?? []
    list.push(p)
    map.set(p.parent_id, list)
  }
  return map
}

const urlCache = new Map<string, { url: string; expires: number }>()

/** Signed URLs for private photos, cached for most of their lifetime. */
export async function photoUrls(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const now = Date.now()
  const missing: string[] = []
  for (const p of paths) {
    const c = urlCache.get(p)
    if (c && c.expires > now) out.set(p, c.url)
    else missing.push(p)
  }
  if (missing.length) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(missing, 3600)
    if (error) throw error
    for (const r of data ?? []) {
      if (r.path && r.signedUrl) {
        out.set(r.path, r.signedUrl)
        urlCache.set(r.path, { url: r.signedUrl, expires: now + 50 * 60 * 1000 })
      }
    }
  }
  return out
}

export async function removePhoto(photo: PhotoRow) {
  const { error } = await supabase.from('photos').update({ deleted_at: new Date().toISOString() }).eq('id', photo.id)
  if (error) throw error
}
