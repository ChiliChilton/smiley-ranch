// A small in-browser stand-in for the Supabase client, used only in demo builds.
// It mimics the subset of PostgREST and the RPCs the app calls, enforces the same
// admin rules as the real RLS policies, and keeps everything in localStorage.
import { DEMO_CODE, DEMO_PIN } from '../demo'
import { seedDb } from './seed'

type Row = Record<string, unknown>
type Result<T> = { data: T; error: null } | { data: null; error: { code: string; message: string } }
type Filter = { col: string; op: 'eq' | 'neq' | 'is' | 'gte' | 'lte' | 'gt' | 'lt'; val: unknown }

const KEY = 'back40.demo.v1'

type State = { db: Record<string, Row[]>; device: { member_id: string | null; is_admin: boolean }; secrets: { code: string; pin: string } }

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as State
  } catch { /* ignore */ }
  return { db: seedDb(), device: { member_id: null, is_admin: false }, secrets: { code: DEMO_CODE, pin: DEMO_PIN } }
}
let state = load()
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* ignore */ }
}
export function resetDemo() {
  state = { db: seedDb(), device: { member_id: null, is_admin: false }, secrets: { code: DEMO_CODE, pin: DEMO_PIN } }
  save()
}

const err = (code: string, message: string) => ({ data: null, error: { code, message } }) as const
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36))
const member = () => state.db.members.find((m) => m.id === state.device.member_id && m.is_active)
const isActive = () => Boolean(member())
const isAdmin = () => isActive() && state.device.is_admin
const whoami = () => {
  const m = state.db.members.find((x) => x.id === state.device.member_id)
  return m
    ? { member_id: m.id, name: m.name, is_active: m.is_active, is_admin: state.device.is_admin && Boolean(m.is_active) }
    : { member_id: null, name: null, is_active: false, is_admin: false }
}
const overlaps = (a: Row, b: Row) => (a.starts_on as string) <= (b.ends_on as string) && (b.starts_on as string) <= (a.ends_on as string)

/** Same gates as the RLS policies in supabase/migrations. */
function canWrite(table: string, op: 'insert' | 'update' | 'delete', row: Row, patch?: Row): { code: string; message: string } | null {
  const me = state.device.member_id
  const rls = (t: string) => ({ code: '42501', message: `new row violates row-level security policy for table "${t}"` })
  if (!isActive()) return rls(table)
  switch (table) {
    case 'members': case 'areas': case 'checklist_items': case 'settings':
      return isAdmin() ? null : rls(table)
    case 'pins': {
      const adminOnly = ['stand', 'feeder', 'camera']
      if (isAdmin()) return null
      const type = String((patch?.type ?? row.type) as string)
      if (adminOnly.includes(type) || row.created_by !== me) return rls(table)
      return null
    }
    case 'stand_claims':
      if (op === 'insert' && row.member_id !== me && !isAdmin()) return rls(table)
      if (op !== 'insert' && row.member_id !== me && !isAdmin()) return rls(table)
      return null
    case 'event_attendees':
      return row.member_id === me || isAdmin() ? null : rls(table)
    default:
      if (op === 'insert') return null
      return row.created_by === me || isAdmin() ? null : rls(table)
  }
}

class Query implements PromiseLike<Result<unknown>> {
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
  private filters: Filter[] = []
  private orders: { col: string; asc: boolean }[] = []
  private lim: number | null = null
  private mode: 'many' | 'single' | 'maybe' = 'many'
  private payload: Row | Row[] | null = null
  private returning = false
  private onConflict: string | null = null
  private table: string
  constructor(table: string) {
    this.table = table
  }

  select(_cols?: string) { if (this.op !== 'select') this.returning = true; return this }
  insert(rows: Row | Row[]) { this.op = 'insert'; this.payload = rows; return this }
  upsert(rows: Row | Row[], opts?: { onConflict?: string }) { this.op = 'upsert'; this.payload = rows; this.onConflict = opts?.onConflict ?? 'id'; return this }
  update(patch: Row) { this.op = 'update'; this.payload = patch; return this }
  delete() { this.op = 'delete'; return this }
  eq(col: string, val: unknown) { this.filters.push({ col, op: 'eq', val }); return this }
  neq(col: string, val: unknown) { this.filters.push({ col, op: 'neq', val }); return this }
  is(col: string, val: unknown) { this.filters.push({ col, op: 'is', val }); return this }
  gte(col: string, val: unknown) { this.filters.push({ col, op: 'gte', val }); return this }
  lte(col: string, val: unknown) { this.filters.push({ col, op: 'lte', val }); return this }
  gt(col: string, val: unknown) { this.filters.push({ col, op: 'gt', val }); return this }
  lt(col: string, val: unknown) { this.filters.push({ col, op: 'lt', val }); return this }
  order(col: string, opts?: { ascending?: boolean }) { this.orders.push({ col, asc: opts?.ascending ?? true }); return this }
  limit(n: number) { this.lim = n; return this }
  single() { this.mode = 'single'; return this }
  maybeSingle() { this.mode = 'maybe'; return this }

  then<R1 = Result<unknown>, R2 = never>(onf?: ((v: Result<unknown>) => R1 | PromiseLike<R1>) | null, onr?: ((e: unknown) => R2 | PromiseLike<R2>) | null) {
    return new Promise<Result<unknown>>((resolve) => setTimeout(() => resolve(this.run()), 60)).then(onf, onr)
  }

  private matches(r: Row) {
    return this.filters.every(({ col, op, val }) => {
      const x = r[col]
      switch (op) {
        case 'eq': return x === val
        case 'neq': return x !== val
        case 'is': return val === null ? x == null : x === val
        case 'gte': return (x as string) >= (val as string)
        case 'lte': return (x as string) <= (val as string)
        case 'gt': return (x as string) > (val as string)
        case 'lt': return (x as string) < (val as string)
      }
    })
  }

  private finish(rows: Row[]): Result<unknown> {
    const out = rows.map((r) => ({ ...r }))
    if (this.mode === 'single') return out.length ? { data: out[0], error: null } : err('PGRST116', 'JSON object requested, multiple (or no) rows returned')
    if (this.mode === 'maybe') return { data: out[0] ?? null, error: null }
    return { data: out, error: null }
  }

  private run(): Result<unknown> {
    const rows = (state.db[this.table] ??= [])
    const me = state.device.member_id
    if (this.op === 'select') {
      if (!isActive()) return this.finish([])
      let list = rows.filter((r) => this.matches(r))
      if (!isAdmin() && 'deleted_at' in (rows[0] ?? {})) list = list.filter((r) => r.deleted_at == null)
      for (const { col, asc } of [...this.orders].reverse()) {
        list = [...list].sort((a, b) => {
          const x = a[col] as string | number | null, y = b[col] as string | number | null
          const c = x == null ? 1 : y == null ? -1 : x < y ? -1 : x > y ? 1 : 0
          return asc ? c : -c
        })
      }
      if (this.lim != null) list = list.slice(0, this.lim)
      return this.finish(list)
    }
    if (this.op === 'insert' || this.op === 'upsert') {
      const now = new Date().toISOString()
      const inserted: Row[] = []
      for (const r of Array.isArray(this.payload) ? this.payload : [this.payload as Row]) {
        if (this.op === 'upsert') {
          const existing = rows.find((x) => x[this.onConflict!] === r[this.onConflict!])
          if (existing) {
            const denied = canWrite(this.table, 'update', existing, r)
            if (denied) return err(denied.code, denied.message)
            Object.assign(existing, r, { updated_at: now }); inserted.push(existing); continue
          }
        }
        const row: Row = { id: uuid(), created_by: me, created_at: now, updated_at: now, ...(this.table === 'stand_claims' ? { released_at: null, released_by: null } : { deleted_at: null }), ...r }
        if (this.table === 'settings') delete row.id
        if (this.table === 'event_attendees') delete row.id
        const denied = canWrite(this.table, 'insert', row)
        if (denied) return err(denied.code, denied.message)
        if (this.table === 'stand_claims' && rows.some((c) => c.stand_id === row.stand_id && c.date === row.date && c.sit === row.sit && c.released_at == null))
          return err('23505', 'duplicate key value violates unique constraint "stand_claims_unique_live_idx"')
        if (this.table === 'events' && row.kind === 'exclusive') {
          const clash = rows.find((e) => e.kind === 'exclusive' && e.deleted_at == null && overlaps(e, row))
          if (clash) {
            const who = state.db.members.find((m) => m.id === clash.created_by)?.name ?? 'Someone'
            return err('23P01', `${who} already has the place those dates (${clash.title})`)
          }
        }
        rows.push(row); inserted.push(row)
      }
      save()
      return this.returning ? this.finish(inserted) : { data: null, error: null }
    }
    if (this.op === 'update') {
      const list = rows.filter((r) => this.matches(r))
      const now = new Date().toISOString()
      const updated: Row[] = []
      for (const r of list) {
        const denied = canWrite(this.table, 'update', r, this.payload as Row)
        if (denied) continue // RLS: silently no-op, like Postgres
        if (this.table === 'events' && ((this.payload as Row).kind === 'exclusive' || r.kind === 'exclusive')) {
          const next = { ...r, ...(this.payload as Row) }
          if (next.kind === 'exclusive') {
            const clash = rows.find((e) => e.id !== r.id && e.kind === 'exclusive' && e.deleted_at == null && overlaps(e, next))
            if (clash) {
              const who = state.db.members.find((m) => m.id === clash.created_by)?.name ?? 'Someone'
              return err('23P01', `${who} already has the place those dates (${clash.title})`)
            }
          }
        }
        Object.assign(r, this.payload, 'updated_at' in r ? { updated_at: now } : {})
        updated.push(r)
      }
      save()
      return this.returning ? this.finish(updated) : { data: null, error: null }
    }
    // delete
    const keep: Row[] = []
    const gone: Row[] = []
    for (const r of rows) {
      if (this.matches(r) && !canWrite(this.table, 'delete', r)) gone.push(r)
      else keep.push(r)
    }
    state.db[this.table] = keep
    save()
    return this.returning ? this.finish(gone) : { data: null, error: null }
  }
}

function rpc(name: string, args: Row = {}): Promise<Result<unknown>> {
  const run = (): Result<unknown> => {
    const code = String(args.code ?? '').trim()
    switch (name) {
      case 'whoami': return { data: whoami(), error: null }
      case 'list_members_with_code':
        if (code !== state.secrets.code) return err('28P01', 'That family code is not right')
        return { data: state.db.members.filter((m) => m.is_active).map(({ id, name }) => ({ id, name })).sort((a, b) => String(a.name).localeCompare(String(b.name))), error: null }
      case 'join_with_code': {
        if (code !== state.secrets.code) return err('28P01', 'That family code is not right')
        const m = state.db.members.find((x) => x.id === args.member_id && x.is_active)
        if (!m) return err('P0002', 'That person is not on the list')
        state.device = { member_id: m.id as string, is_admin: false }; save()
        return { data: whoami(), error: null }
      }
      case 'switch_member': {
        if (!isActive()) return err('28000', 'Join with the family code first')
        const m = state.db.members.find((x) => x.id === args.member_id && x.is_active)
        if (!m) return err('P0002', 'That person is not on the list')
        state.device = { member_id: m.id as string, is_admin: false }; save()
        return { data: whoami(), error: null }
      }
      case 'unlock_admin':
        if (!isActive()) return err('28000', 'Join with the family code first')
        if (String(args.pin ?? '').trim() !== state.secrets.pin) return err('28P01', 'That PIN is not right')
        state.device.is_admin = true; save()
        return { data: whoami(), error: null }
      case 'lock_admin':
        state.device.is_admin = false; save()
        return { data: whoami(), error: null }
      case 'set_family_code':
        if (!isAdmin()) return err('42501', 'Admin only')
        if (String(args.new_code ?? '').trim().length < 4) return err('P0001', 'Family code must be at least 4 characters')
        state.secrets.code = String(args.new_code).trim(); save()
        return { data: null, error: null }
      case 'set_admin_pin':
        if (!isAdmin()) return err('42501', 'Admin only')
        if (String(args.new_pin ?? '').trim().length < 4) return err('P0001', 'Admin PIN must be at least 4 characters')
        state.secrets.pin = String(args.new_pin).trim(); save()
        return { data: null, error: null }
      default: return err('42883', `function ${name} does not exist`)
    }
  }
  return new Promise((resolve) => setTimeout(() => resolve(run()), 80))
}

const channel = () => {
  const ch = { on: () => ch, subscribe: () => ch, unsubscribe: () => Promise.resolve('ok') }
  return ch
}

export function createMockClient() {
  return {
    from: (table: string) => new Query(table),
    rpc,
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'demo-device' } } }, error: null }),
      signInAnonymously: async () => ({ data: { session: { user: { id: 'demo-device' } } }, error: null }),
    },
    channel,
    removeChannel: async () => 'ok',
  }
}
