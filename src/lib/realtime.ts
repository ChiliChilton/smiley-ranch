import { useEffect, useRef } from 'react'
import { supabase } from './supabase'

/** Re-run `onChange` whenever any row in these tables changes (insert/update/delete). */
export function useRealtime(tables: string[], onChange: () => void | Promise<void>) {
  const cb = useRef(onChange)
  const key = tables.join(',')

  useEffect(() => {
    cb.current = onChange
  })

  useEffect(() => {
    const channel = supabase.channel(`rt:${key}:${Math.random().toString(36).slice(2)}`)
    for (const table of key.split(',')) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => void cb.current())
    }
    channel.subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [key])
}
