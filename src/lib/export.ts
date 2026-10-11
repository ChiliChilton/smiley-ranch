// Everything out, any time: JSON of all tables, CSV per table, KML of the map. Admin only (RLS lets the admin see deleted rows too).
import { supabase } from './supabase'
import { isAreaGeometry } from './geo'

export const EXPORT_TABLES = [
  'members', 'pins', 'areas', 'stand_claims', 'harvests', 'feeder_fills',
  'log_entries', 'comments', 'events', 'event_attendees', 'todos', 'supply_items',
  'checklist_items', 'checkouts', 'settings',
] as const
export type ExportTable = (typeof EXPORT_TABLES)[number]

type Row = Record<string, unknown>

export async function fetchTable(table: ExportTable): Promise<Row[]> {
  const out: Row[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table as 'members').select('*').range(from, from + 999)
    if (error) throw error
    out.push(...((data ?? []) as Row[]))
    if (!data || data.length < 1000) break
  }
  return out
}

export async function fetchAll(): Promise<Record<string, Row[]>> {
  const entries = await Promise.all(EXPORT_TABLES.map(async (t) => [t, await fetchTable(t)] as const))
  return Object.fromEntries(entries)
}

export function toCSV(rows: Row[]): string {
  if (rows.length === 0) return ''
  const cols = Array.from(rows.reduce((set, r) => { Object.keys(r).forEach((k) => set.add(k)); return set }, new Set<string>()))
  const cell = (v: unknown) => {
    if (v == null) return ''
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n')
}

const esc = (s: unknown) => String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] ?? c)

/** Pins as placemarks, boundary and areas as polygons. Opens in Google Earth, onX, Gaia, etc. */
export function toKML(pins: Row[], areas: Row[], name = 'Smiley Ranch'): string {
  const pts = pins
    .filter((p) => !p.deleted_at)
    .map((p) => `  <Placemark><name>${esc(p.name)}</name><description>${esc(p.type)}${p.notes ? ': ' + esc(p.notes) : ''}</description><Point><coordinates>${p.lng},${p.lat},0</coordinates></Point></Placemark>`)
  const polys = areas
    .filter((a) => !a.deleted_at && isAreaGeometry(a.geometry))
    .map((a) => {
      const g = a.geometry as { type: string; coordinates: number[][][] | number[][][][] }
      const rings = g.type === 'Polygon' ? [g.coordinates as number[][][]] : (g.coordinates as number[][][][])
      const polyXml = rings
        .map((poly) => `<Polygon><outerBoundaryIs><LinearRing><coordinates>${poly[0].map((c) => `${c[0]},${c[1]},0`).join(' ')}</coordinates></LinearRing></outerBoundaryIs>${poly.slice(1).map((h) => `<innerBoundaryIs><LinearRing><coordinates>${h.map((c) => `${c[0]},${c[1]},0`).join(' ')}</coordinates></LinearRing></innerBoundaryIs>`).join('')}</Polygon>`)
        .join('')
      const wrapped = rings.length > 1 ? `<MultiGeometry>${polyXml}</MultiGeometry>` : polyXml
      return `  <Placemark><name>${esc(a.is_boundary ? 'Property boundary' : a.name)}</name>${wrapped}</Placemark>`
    })
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(name)}</name>\n${[...polys, ...pts].join('\n')}\n</Document></kml>\n`
}

/** Hand a file to the phone: share sheet when it can take files, otherwise a download. */
export async function deliverFile(filename: string, content: string, type: string): Promise<'shared' | 'downloaded'> {
  const blob = new Blob([content], { type })
  const file = new File([blob], filename, { type })
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: filename })
      return 'shared'
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') return 'shared'
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}

export const stamp = () => new Date().toISOString().slice(0, 10)
