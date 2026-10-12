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
  headcount: number
  created_by: string | null
  created_at: string
}

export type SeasonSpecies = 'deer' | 'turkey' | 'dove' | 'quail' | 'other'
export type SeasonRow = {
  id: string
  name: string
  species: SeasonSpecies
  starts_on: string
  ends_on: string
  note: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
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

export type LogEntryRow = {
  id: string
  body: string
  pin_id: string | null
  lat: number | null
  lng: number | null
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type CommentParent = 'log_entry' | 'harvest' | 'todo' | 'event' | 'pin'

export type CommentRow = {
  id: string
  parent_type: CommentParent
  parent_id: string
  body: string
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type TodoRow = {
  id: string
  title: string
  notes: string | null
  assignee_id: string | null
  due_on: string | null
  pin_id: string | null
  asset_id: string | null
  status: 'open' | 'done'
  completed_by: string | null
  completed_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type SupplyLevel = 'full' | 'some' | 'low' | 'out'

export type AssetKind = 'building' | 'vehicle' | 'atv' | 'tractor' | 'trailer' | 'other'
export type AssetStatus = 'good' | 'attention' | 'down'
export type AssetRow = {
  id: string
  name: string
  kind: AssetKind
  status: AssetStatus
  note: string | null
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type InfoSection = 'access' | 'house' | 'utilities' | 'contacts'
export type InfoItemRow = {
  id: string
  section: InfoSection
  label: string
  value: string
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type SupplyItemRow = {
  id: string
  name: string
  notes: string | null
  is_inventory: boolean
  asset_id: string | null
  level: SupplyLevel | null
  needed: boolean
  got_by: string | null
  got_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type PushPrefs = {
  stand_claims: boolean
  harvests: boolean
  todos_assigned: boolean
  feeders_overdue: boolean
  events: boolean
}

export type PushSubscriptionRow = {
  id: string
  auth_user_id: string
  member_id: string
  endpoint: string
  p256dh: string
  auth: string
  prefs: PushPrefs
  created_by: string | null
  created_at: string
  updated_at: string
}


export type FeederFillRow = {
  id: string
  feeder_id: string
  filled_at: string
  bags: number | null
  amount: string | null
  feed_type: string | null
  created_by: string | null
  created_at: string
  deleted_at: string | null
}

export type HarvestRow = {
  id: string
  member_id: string
  harvested_on: string
  species: string
  sex: string | null
  description: string | null
  pin_id: string | null
  lat: number | null
  lng: number | null
  notes: string | null
  tag_number: string | null
  logged_on_license: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type PinType = 'stand' | 'feeder' | 'camera' | 'water' | 'gate' | 'food_plot' | 'hazard' | 'other'
export type StandType = 'ladder' | 'box_blind' | 'ground_blind'
export type Sit = 'am' | 'pm'

export type PinRow = {
  id: string
  type: PinType
  name: string
  notes: string | null
  lat: number | null
  lng: number | null
  stand_type: StandType | null
  has_feeder: boolean
  fill_interval_days: number | null
  days_per_bag: number | null
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type AreaRow = {
  id: string
  name: string
  is_boundary: boolean
  geometry: Json
  color: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type StandClaimRow = {
  id: string
  stand_id: string
  member_id: string
  date: string
  sit: Sit
  note: string | null
  created_by: string | null
  created_at: string
  released_at: string | null
  released_by: string | null
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
        Insert: { event_id: string; member_id: string; note?: string | null; headcount?: number; created_by?: string | null }
        Update: { note?: string | null; headcount?: number }
        Relationships: []
      }
      checklist_items: {
        Row: ChecklistItemRow
        Insert: { id?: string; title: string; sort_order?: number; created_by?: string | null }
        Update: { title?: string; sort_order?: number; deleted_at?: string | null }
        Relationships: []
      }
      assets: {
        Row: AssetRow
        Insert: { id?: string; name: string; kind?: AssetKind; status?: AssetStatus; note?: string | null; sort_order?: number; created_by?: string | null }
        Update: { name?: string; kind?: AssetKind; status?: AssetStatus; note?: string | null; sort_order?: number; deleted_at?: string | null }
        Relationships: []
      }
      info_items: {
        Row: InfoItemRow
        Insert: { id?: string; section: InfoSection; label: string; value?: string; sort_order?: number; created_by?: string | null }
        Update: { section?: InfoSection; label?: string; value?: string; sort_order?: number; deleted_at?: string | null }
        Relationships: []
      }
      seasons: {
        Row: SeasonRow
        Insert: { id?: string; name: string; species?: SeasonSpecies; starts_on: string; ends_on: string; note?: string | null; created_by?: string | null }
        Update: { name?: string; species?: SeasonSpecies; starts_on?: string; ends_on?: string; note?: string | null; deleted_at?: string | null }
        Relationships: []
      }
      pins: {
        Row: PinRow
        Insert: {
          id?: string
          type: PinType
          name: string
          notes?: string | null
          lat?: number | null
          lng?: number | null
          stand_type?: StandType | null
          has_feeder?: boolean
          fill_interval_days?: number | null
          days_per_bag?: number | null
          created_by?: string | null
        }
        Update: {
          type?: PinType
          name?: string
          notes?: string | null
          lat?: number | null
          lng?: number | null
          stand_type?: StandType | null
          has_feeder?: boolean
          fill_interval_days?: number | null
          days_per_bag?: number | null
          deleted_at?: string | null
        }
        Relationships: []
      }
      areas: {
        Row: AreaRow
        Insert: { id?: string; name: string; is_boundary?: boolean; geometry: Json; color?: string | null; created_by?: string | null }
        Update: { name?: string; is_boundary?: boolean; geometry?: Json; color?: string | null; deleted_at?: string | null }
        Relationships: []
      }
      stand_claims: {
        Row: StandClaimRow
        Insert: { id?: string; stand_id: string; member_id: string; date: string; sit: Sit; note?: string | null; created_by?: string | null }
        Update: { note?: string | null; released_at?: string | null; released_by?: string | null }
        Relationships: []
      }
      feeder_fills: {
        Row: FeederFillRow
        Insert: { id?: string; feeder_id: string; filled_at?: string; bags?: number | null; amount?: string | null; feed_type?: string | null; created_by?: string | null }
        Update: { bags?: number | null; amount?: string | null; feed_type?: string | null; filled_at?: string; deleted_at?: string | null }
        Relationships: []
      }
      harvests: {
        Row: HarvestRow
        Insert: {
          id?: string
          member_id: string
          harvested_on?: string
          species: string
          sex?: string | null
          description?: string | null
          pin_id?: string | null
          lat?: number | null
          lng?: number | null
          notes?: string | null
          tag_number?: string | null
          logged_on_license?: boolean
          created_by?: string | null
        }
        Update: Partial<Omit<HarvestRow, 'id' | 'created_by' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      log_entries: {
        Row: LogEntryRow
        Insert: { id?: string; body: string; pin_id?: string | null; lat?: number | null; lng?: number | null; created_by?: string | null }
        Update: { body?: string; pin_id?: string | null; lat?: number | null; lng?: number | null; deleted_at?: string | null }
        Relationships: []
      }
      comments: {
        Row: CommentRow
        Insert: { id?: string; parent_type: CommentParent; parent_id: string; body: string; created_by?: string | null }
        Update: { body?: string; deleted_at?: string | null }
        Relationships: []
      }
      todos: {
        Row: TodoRow
        Insert: {
          id?: string
          title: string
          notes?: string | null
          assignee_id?: string | null
          due_on?: string | null
          pin_id?: string | null
          asset_id?: string | null
          status?: 'open' | 'done'
          created_by?: string | null
        }
        Update: Partial<Omit<TodoRow, 'id' | 'created_by' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      supply_items: {
        Row: SupplyItemRow
        Insert: { id?: string; name: string; notes?: string | null; is_inventory?: boolean; asset_id?: string | null; level?: SupplyLevel | null; needed?: boolean; created_by?: string | null }
        Update: Partial<Omit<SupplyItemRow, 'id' | 'created_by' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      push_subscriptions: {
        Row: PushSubscriptionRow
        Insert: { id?: string; auth_user_id: string; member_id: string; endpoint: string; p256dh: string; auth: string; prefs: PushPrefs; created_by?: string | null }
        Update: { member_id?: string; prefs?: PushPrefs; p256dh?: string; auth?: string }
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
      pin_type: PinType
      stand_type: StandType
      sit: Sit
      todo_status: 'open' | 'done'
      supply_level: 'full' | 'some' | 'low' | 'out'
      event_kind: EventKind
    }
    CompositeTypes: Record<string, never>
  }
}
