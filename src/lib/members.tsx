import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { MemberRow } from './database.types'
import { supabase } from './supabase'
import { useRealtime } from './realtime'

// Everyone, including deactivated people, so old posts still show a name.

type Ctx = {
  members: MemberRow[]
  active: MemberRow[]
  nameOf: (id: string | null | undefined) => string
  reload: () => Promise<void>
}

const MembersContext = createContext<Ctx | null>(null)

export function MembersProvider({ children }: { children: ReactNode }) {
  const [members, setMembers] = useState<MemberRow[]>([])

  const reload = useCallback(async () => {
    const { data } = await supabase.from('members').select('*').order('name')
    if (data) setMembers(data)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])
  useRealtime(['members'], reload)

  const value = useMemo<Ctx>(() => {
    const byId = new Map(members.map((m) => [m.id, m]))
    return {
      members,
      active: members.filter((m) => m.is_active),
      nameOf: (id) => (id ? (byId.get(id)?.name ?? 'Someone') : 'Someone'),
      reload,
    }
  }, [members, reload])

  return <MembersContext.Provider value={value}>{children}</MembersContext.Provider>
}

export function useMembers() {
  const ctx = useContext(MembersContext)
  if (!ctx) throw new Error('useMembers must be used inside MembersProvider')
  return ctx
}
