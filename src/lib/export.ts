// Everything out, any time: JSON of all tables, CSV per table. Admin only (RLS lets the admin see deleted rows too).
import { supabase } from './supabase'

export const EXPORT_TABLES = [
  'members', 'pins', 'areas', 'stand_claims', 'harvests', 'feeder_fills',
  'log_entries', 'comments', 'events', 'event_attendees', 'todos', 'supply_items',
  'checklist_items', 'checkouts', 'settings', 'seasons', 'assets', 'info_items', 'catches',
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
