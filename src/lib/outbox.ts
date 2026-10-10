// Offline outbox. New entries go here when there's no signal and get replayed in order later.
// Inserts carry their own id (made on the phone), so a later update to the same row can be
// merged into the queued insert instead of racing it.
import { openDB, type IDBPDatabase } from 'idb'
import { useSyncExternalStore } from 'react'
import { supabase } from './supabase'

export type OutboxOp = {
  id: string            // op id
  table: string
  op: 'insert' | 'update'
  payload: Record<string, unknown>
  match?: Record<string, unknown>  // for updates: { id: rowId }
  created_at: string
}

const DB_NAME = 'back40'
const STORE = 'outbox'

let dbp: Promise<IDBPDatabase> | null = null
function db() {
  if (!dbp) dbp = openDB(DB_NAME, 1, { upgrade(d) { d.createObjectStore(STORE, { keyPath: 'id' }) } })
  return dbp
}

// ---- pending count, for the indicator ----
let pending = 0
const listeners = new Set<() => void>()
function emit() { listeners.forEach((l) => l()) }
async function recount() {
  try { pending = await (await db()).count(STORE) } catch { pending = 0 }
  emit()
}
export function usePendingSync(): number {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb) }, () => pending, () => 0)
}
void recount()

export function isNetworkError(err: unknown): boolean {
  const e = err as { message?: string; name?: string; code?: string }
  const msg = e?.message ?? ''
  return e?.name === 'TypeError' && /fetch|network|load failed/i.test(msg) || /Failed to fetch|NetworkError|Load failed|network/i.test(msg) || e?.name === 'AuthRetryableFetchError'
}

const online = () => typeof navigator === 'undefined' || navigator.onLine !== false

async function enqueue(op: Omit<OutboxOp, 'id' | 'created_at'>) {
  const row: OutboxOp = { ...op, id: crypto.randomUUID(), created_at: new Date().toISOString() }
  await (await db()).put(STORE, row)
  await recount()
}

/** Insert now if we can; otherwise queue it. Returns the row as it will exist, with its id. */
export async function createRow<T extends Record<string, unknown>>(table: string, row: T): Promise<{ row: T & { id: string }; queued: boolean }> {
  const withId = { id: crypto.randomUUID(), ...row } as T & { id: string }
  if (online()) {
    const { error } = await supabase.from(table as 'log_entries').insert(withId as never)
    if (!error) return { row: withId, queued: false }
    if (!isNetworkError(error)) throw error
  }
  await enqueue({ table, op: 'insert', payload: withId })
  return { row: withId, queued: true }
}

/** Update now if we can; if the row is still waiting in the outbox, fold the change into it. */
export async function patchRow(table: string, id: string, patch: Record<string, unknown>): Promise<{ queued: boolean }> {
  const d = await db()
  const all = (await d.getAll(STORE)) as OutboxOp[]
  const waiting = all.find((o) => o.table === table && o.op === 'insert' && o.payload.id === id)
  if (waiting) {
    waiting.payload = { ...waiting.payload, ...patch }
    await d.put(STORE, waiting)
    return { queued: true }
  }
  if (online()) {
    const { error } = await supabase.from(table as 'log_entries').update(patch as never).eq('id', id)
    if (!error) return { queued: false }
    if (!isNetworkError(error)) throw error
  }
  await enqueue({ table, op: 'update', payload: patch, match: { id } })
  return { queued: true }
}

let flushing = false
/** Replay the queue in order. Stops at the first network failure; drops ops the server rejects for other reasons. */
export async function flushOutbox(): Promise<{ sent: number; left: number }> {
  if (flushing) return { sent: 0, left: pending }
  flushing = true
  let sent = 0
  try {
    const d = await db()
    const ops = ((await d.getAll(STORE)) as OutboxOp[]).sort((a, b) => a.created_at.localeCompare(b.created_at))
    for (const op of ops) {
      const q = supabase.from(op.table as 'log_entries')
      const { error } = op.op === 'insert' ? await q.insert(op.payload as never) : await q.update(op.payload as never).match(op.match ?? {})
      if (error) {
        if (isNetworkError(error)) break
        console.warn('outbox: server rejected, dropping', op.table, error.message)
        if (error.code !== '23505') { await d.delete(STORE, op.id); continue } // 23505 = already there (replayed before): drop too
        await d.delete(STORE, op.id)
        continue
      }
      await d.delete(STORE, op.id)
      sent++
    }
  } finally {
    flushing = false
    await recount()
  }
  return { sent, left: pending }
}

/** Start the background behaviours: replay on reconnect, on launch, and every so often while anything is waiting. */
export function startOutbox() {
  const kick = () => void flushOutbox()
  window.addEventListener('online', kick)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') kick() })
  kick()
  setInterval(() => { if (pending > 0 && online()) kick() }, 30_000)
}
