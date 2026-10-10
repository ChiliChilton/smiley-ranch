// Hand-written. Once the Supabase CLI is linked you can regenerate with:
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

export type EventKind = 'exclusive' | 'inclusive' | 'info'

export type EventRow = {
  id: string
  title: string
  kind: EventKind
  starts_on: string
  ends_on: string
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type EventAttendeeRow = {
  event_id: string
  member_id: string
  note: string | null
  created_by: string | null
  created_at: string
}

export type ChecklistItemRow = {
  id: string
  title: string
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type CheckoutItem = { id: string; title: string; done: boolean }

export type CheckoutRow = {
  id: string
  member_id: string
  event_id: string | null
  left_at: string
  items: CheckoutItem[]
  all_done: boolean
  notes: string | null
  created_by: string | null
  created_at: string
  deleted_at: string | null
}

export type SettingRow = { key: string; value: string; updated_at: string }

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
        Row: SettingRow
        Insert: { key: string; value: string }
        Update: { value?: string }
        Relationships: []
      }
      events: {
        Row: EventRow
        Insert: {
          id?: string
          title: string
          kind: EventKind
          starts_on: string
          ends_on: string
          notes?: string | null
          created_by?: string | null
        }
        Update: {
          title?: string
          kind?: EventKind
          starts_on?: string
          ends_on?: string
          notes?: string | null
          deleted_at?: string | null
        }
        Relationships: []
      }
      event_attendees: {
        Row: EventAttendeeRow
        Insert: { event_id: string; member_id: string; note?: string | null; created_by?: string | null }
        Update: { note?: string | null }
        Relationships: []
      }
      checklist_items: {
        Row: ChecklistItemRow
        Insert: { id?: string; title: string; sort_order?: number; created_by?: string | null }
        Update: { title?: string; sort_order?: number; deleted_at?: string | null }
        Relationships: []
      }
      checkouts: {
        Row: CheckoutRow
        Insert: {
          id?: string
          member_id: string
          event_id?: string | null
          left_at?: string
          items: CheckoutItem[]
          all_done: boolean
          notes?: string | null
          created_by?: string | null
        }
        Update: { notes?: string | null; deleted_at?: string | null }
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
      event_kind: EventKind
    }
    CompositeTypes: Record<string, never>
  }
}
