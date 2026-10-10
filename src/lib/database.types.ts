// Hand-written for Phase 1. Once the Supabase CLI is linked you can regenerate with:
//   supabase gen types typescript --linked > src/lib/database.types.ts
// Only the tables and RPCs the app currently touches are typed here.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type WhoAmI = {
  member_id: string | null
  name: string | null
  is_active: boolean
  is_admin: boolean
}

export type MemberRow = {
  id: string
  name: string
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type Database = {
  public: {
    Tables: {
      members: {
        Row: MemberRow
        Insert: { id?: string; name: string; is_active?: boolean; created_by?: string | null }
        Update: { name?: string; is_active?: boolean }
        Relationships: []
      }
      settings: {
        Row: { key: string; value: string; updated_at: string }
        Insert: { key: string; value: string }
        Update: { value?: string }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      whoami: { Args: Record<string, never>; Returns: Json }
      list_members_with_code: { Args: { code: string }; Returns: { id: string; name: string }[] }
      join_with_code: { Args: { code: string; member_id: string }; Returns: Json }
      switch_member: { Args: { member_id: string }; Returns: Json }
      unlock_admin: { Args: { pin: string }; Returns: Json }
      lock_admin: { Args: Record<string, never>; Returns: Json }
      set_family_code: { Args: { new_code: string }; Returns: undefined }
      set_admin_pin: { Args: { new_pin: string }; Returns: undefined }
    }
    Enums: {
      pin_type: 'stand' | 'feeder' | 'camera' | 'water' | 'gate' | 'food_plot' | 'hazard' | 'other'
      stand_type: 'ladder' | 'box_blind' | 'ground_blind'
      sit: 'am' | 'pm'
      todo_status: 'open' | 'done'
      supply_level: 'full' | 'some' | 'low' | 'out'
    }
    CompositeTypes: Record<string, never>
  }
}
