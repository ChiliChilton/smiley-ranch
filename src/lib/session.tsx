import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase, supabaseConfigured } from './supabase'
import type { WhoAmI } from './database.types'
import { friendlyError } from './errors'
import { readJSON, remove, writeJSON } from './storage'

// Session = this device's anonymous auth user + the member it's linked to.
//
//   loading  -> talking to Supabase
//   error    -> couldn't sign in or load (no signal, misconfigured env)
//   ready    -> me is populated. me.member_id null means "not joined yet".

const ME_KEY = 'back40.me'

export type SessionState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; me: WhoAmI; offline: boolean }

type SessionActions = {
  refresh: () => Promise<void>
  listMembersWithCode: (code: string) => Promise<{ id: string; name: string }[]>
  join: (code: string, memberId: string) => Promise<void>
  switchMember: (memberId: string) => Promise<void>
  unlockAdmin: (pin: string) => Promise<void>
  lockAdmin: () => Promise<void>
}

const SessionContext = createContext<(SessionState & SessionActions) | null>(null)

const EMPTY_ME: WhoAmI = { member_id: null, name: null, is_active: false, is_admin: false }

function asMe(data: unknown): WhoAmI {
  const d = (data ?? {}) as Partial<WhoAmI>
  return {
    member_id: d.member_id ?? null,
    name: d.name ?? null,
    is_active: Boolean(d.is_active),
    is_admin: Boolean(d.is_admin),
  }
}

async function ensureSignedIn() {
  const { data } = await supabase.auth.getSession()
  if (data.session) return data.session
  const { data: anon, error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  if (!anon.session) throw new Error('Could not start a session.')
  return anon.session
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>(() =>
    supabaseConfigured
      ? { status: 'loading' }
      : {
          status: 'error',
          message: 'The app is missing its Supabase settings (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).',
        },
  )
  const mounted = useRef(true)

  const applyMe = useCallback((raw: unknown) => {
    const me = asMe(raw)
    if (me.member_id) writeJSON(ME_KEY, me)
    else remove(ME_KEY)
    if (mounted.current) setState({ status: 'ready', me, offline: false })
    return me
  }, [])

  const refresh = useCallback(async () => {
    if (!supabaseConfigured) return
    try {
      await ensureSignedIn()
      const { data, error } = await supabase.rpc('whoami')
      if (error) throw error
      applyMe(data)
    } catch (err) {
      // Weak signal: fall back to who we were last time so the shell still opens.
      const cached = readJSON<WhoAmI>(ME_KEY)
      if (cached?.member_id) {
        if (mounted.current) setState({ status: 'ready', me: cached, offline: true })
      } else if (mounted.current) {
        setState({ status: 'error', message: friendlyError(err) })
      }
    }
  }, [applyMe])

  useEffect(() => {
    mounted.current = true
    void refresh()
    const onOnline = () => void refresh()
    window.addEventListener('online', onOnline)
    return () => {
      mounted.current = false
      window.removeEventListener('online', onOnline)
    }
  }, [refresh])

  const listMembersWithCode = useCallback(async (code: string) => {
    await ensureSignedIn()
    const { data, error } = await supabase.rpc('list_members_with_code', { code })
    if (error) throw error
    return data ?? []
  }, [])

  const join = useCallback(
    async (code: string, memberId: string) => {
      await ensureSignedIn()
      const { data, error } = await supabase.rpc('join_with_code', { code, member_id: memberId })
      if (error) throw error
      applyMe(data)
    },
    [applyMe],
  )

  const switchMember = useCallback(
    async (memberId: string) => {
      const { data, error } = await supabase.rpc('switch_member', { member_id: memberId })
      if (error) throw error
      applyMe(data)
    },
    [applyMe],
  )

  const unlockAdmin = useCallback(
    async (pin: string) => {
      const { data, error } = await supabase.rpc('unlock_admin', { pin })
      if (error) throw error
      applyMe(data)
    },
    [applyMe],
  )

  const lockAdmin = useCallback(async () => {
    const { data, error } = await supabase.rpc('lock_admin')
    if (error) throw error
    applyMe(data)
  }, [applyMe])

  const value = useMemo(
    () => ({ ...state, refresh, listMembersWithCode, join, switchMember, unlockAdmin, lockAdmin }),
    [state, refresh, listMembersWithCode, join, switchMember, unlockAdmin, lockAdmin],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}

/** For screens that only render once we're joined and active. */
export function useMe(): WhoAmI {
  const s = useSession()
  return s.status === 'ready' ? s.me : EMPTY_ME
}
