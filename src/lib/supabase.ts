import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { DEMO } from './demo'
import { createMockClient } from './demo/mockClient'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = DEMO || Boolean(url && key)

const real = () => createClient<Database>(
  url ?? 'http://localhost:54321',
  key ?? 'missing-key',
  {
    auth: {
      // Each device keeps its anonymous session in localStorage.
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'back40.auth',
    },
  },
)

export const supabase: SupabaseClient<Database> = DEMO ? (createMockClient() as unknown as SupabaseClient<Database>) : real()
