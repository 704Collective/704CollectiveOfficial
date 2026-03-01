export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_requests: {
        Row: {
          email: string
          full_name: string | null
          id: string
          requested_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          email: string
          full_name?: string | null
          id?: string
          requested_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          email?: string
          full_name?: string | null
          id?: string
          requested_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      admin_task_comments: {
        Row: {
          content: string
          created_at: string | null
          id: string
          task_id: string
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          task_id: string
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          task_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "admin_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_task_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          priority: string | null
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string | null
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string | null
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_waitlist: {
        Row: {
          created_at: string | null
          event_id: string
          expires_at: string | null
          id: string
          notified_at: string | null
          position: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          event_id: string
          expires_at?: string | null
          id?: string
          notified_at?: string | null
          position: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          event_id?: string
          expires_at?: string | null
          id?: string
          notified_at?: string | null
          position?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_waitlist_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          allows_guest_passes: boolean
          capacity: number | null
          category: string | null
          created_at: string | null
          description: string | null
          end_time: string
          id: string
          image_url: string | null
          is_members_only: boolean | null
          location_address: string | null
          location_name: string | null
          occurrence_index: number | null
          parent_event_id: string | null
          recurrence_end_date: string | null
          recurrence_rule: string | null
          start_time: string
          tags: string[] | null
          ticket_price: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          allows_guest_passes?: boolean
          capacity?: number | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          end_time: string
          id?: string
          image_url?: string | null
          is_members_only?: boolean | null
          location_address?: string | null
          location_name?: string | null
          occurrence_index?: number | null
          parent_event_id?: string | null
          recurrence_end_date?: string | null
          recurrence_rule?: string | null
          start_time: string
          tags?: string[] | null
          ticket_price?: number | null
          title: string
          updated_at?: string | null
        }
        Update: {
          allows_guest_passes?: boolean
          capacity?: number | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          end_time?: string
          id?: string
          image_url?: string | null
          is_members_only?: boolean | null
          location_address?: string | null
          location_name?: string | null
          occurrence_index?: number | null
          parent_event_id?: string | null
          recurrence_end_date?: string | null
          recurrence_rule?: string | null
          start_time?: string
          tags?: string[] | null
          ticket_price?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_parent_event_id_fkey"
            columns: ["parent_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_passes: {
        Row: {
          converted_to_member_id: string | null
          created_at: string
          event_id: string | null
          expires_at: string
          followup_sent_at: string | null
          guest_email: string
          guest_name: string
          guest_phone: string | null
          id: string
          member_id: string
          month_year: string
          qr_code: string
          status: string
          used_at: string | null
        }
        Insert: {
          converted_to_member_id?: string | null
          created_at?: string
          event_id?: string | null
          expires_at: string
          followup_sent_at?: string | null
          guest_email: string
          guest_name: string
          guest_phone?: string | null
          id?: string
          member_id: string
          month_year: string
          qr_code: string
          status?: string
          used_at?: string | null
        }
        Update: {
          converted_to_member_id?: string | null
          created_at?: string
          event_id?: string | null
          expires_at?: string
          followup_sent_at?: string | null
          guest_email?: string
          guest_name?: string
          guest_phone?: string | null
          id?: string
          member_id?: string
          month_year?: string
          qr_code?: string
          status?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_passes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      homepage_images: {
        Row: {
          alt_text: string | null
          created_at: string | null
          display_order: number | null
          id: string
          image_url: string
          is_active: boolean | null
          uploaded_by: string | null
        }
        Insert: {
          alt_text?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          image_url: string
          is_active?: boolean | null
          uploaded_by?: string | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          image_url?: string
          is_active?: boolean | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "homepage_images_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          access_token: string | null
          account_id: string | null
          account_name: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          provider: string
          refresh_token: string | null
          scopes: string[] | null
          settings: Json | null
          updated_at: string | null
        }
        Insert: {
          access_token?: string | null
          account_id?: string | null
          account_name?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          provider: string
          refresh_token?: string | null
          scopes?: string[] | null
          settings?: Json | null
          updated_at?: string | null
        }
        Update: {
          access_token?: string | null
          account_id?: string | null
          account_name?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          provider?: string
          refresh_token?: string | null
          scopes?: string[] | null
          settings?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string | null
          event_id: string | null
          id: string
          is_read: boolean | null
          message: string
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_id?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_id?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_settings: {
        Row: {
          contact_email: string | null
          description: string | null
          id: string
          instagram_url: string | null
          name: string
          phone: string | null
          tiktok_url: string | null
          updated_at: string | null
          updated_by: string | null
          website_url: string | null
        }
        Insert: {
          contact_email?: string | null
          description?: string | null
          id?: string
          instagram_url?: string | null
          name?: string
          phone?: string | null
          tiktok_url?: string | null
          updated_at?: string | null
          updated_by?: string | null
          website_url?: string | null
        }
        Update: {
          contact_email?: string | null
          description?: string | null
          id?: string
          instagram_url?: string | null
          name?: string
          phone?: string | null
          tiktok_url?: string | null
          updated_at?: string | null
          updated_by?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          description: string | null
          id: string
          metadata: Json | null
          payment_type: string
          status: string
          stripe_customer_id: string | null
          stripe_event_id: string | null
          stripe_payment_intent_id: string | null
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          payment_type: string
          status: string
          stripe_customer_id?: string | null
          stripe_event_id?: string | null
          stripe_payment_intent_id?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          payment_type?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_event_id?: string | null
          stripe_payment_intent_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      processed_webhook_events: {
        Row: {
          event_type: string
          processed_at: string | null
          stripe_event_id: string
        }
        Insert: {
          event_type: string
          processed_at?: string | null
          stripe_event_id: string
        }
        Update: {
          event_type?: string
          processed_at?: string | null
          stripe_event_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          admin_notes: string | null
          avatar_url: string | null
          calendar_token: string
          created_at: string | null
          deleted_at: string | null
          email: string
          full_name: string | null
          hubspot_contact_id: string | null
          id: string
          imported_at: string | null
          member_since: string | null
          member_type: string | null
          membership_duration: string | null
          membership_override: boolean
          notify_announcements: boolean | null
          notify_event_reminders: boolean | null
          notify_new_events: boolean | null
          stripe_customer_id: string | null
          subscription_ends_at: string | null
          subscription_id: string | null
          subscription_paused_until: string | null
          subscription_status: string | null
          updated_at: string | null
        }
        Insert: {
          admin_notes?: string | null
          avatar_url?: string | null
          calendar_token?: string
          created_at?: string | null
          deleted_at?: string | null
          email: string
          full_name?: string | null
          hubspot_contact_id?: string | null
          id: string
          imported_at?: string | null
          member_since?: string | null
          member_type?: string | null
          membership_duration?: string | null
          membership_override?: boolean
          notify_announcements?: boolean | null
          notify_event_reminders?: boolean | null
          notify_new_events?: boolean | null
          stripe_customer_id?: string | null
          subscription_ends_at?: string | null
          subscription_id?: string | null
          subscription_paused_until?: string | null
          subscription_status?: string | null
          updated_at?: string | null
        }
        Update: {
          admin_notes?: string | null
          avatar_url?: string | null
          calendar_token?: string
          created_at?: string | null
          deleted_at?: string | null
          email?: string
          full_name?: string | null
          hubspot_contact_id?: string | null
          id?: string
          imported_at?: string | null
          member_since?: string | null
          member_type?: string | null
          membership_duration?: string | null
          membership_override?: boolean
          notify_announcements?: boolean | null
          notify_event_reminders?: boolean | null
          notify_new_events?: boolean | null
          stripe_customer_id?: string | null
          subscription_ends_at?: string | null
          subscription_id?: string | null
          subscription_paused_until?: string | null
          subscription_status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      prospects: {
        Row: {
          created_at: string | null
          created_by: string | null
          email: string
          full_name: string
          hubspot_contact_id: string | null
          id: string
          notes: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          email: string
          full_name: string
          hubspot_contact_id?: string | null
          id?: string
          notes?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          email?: string
          full_name?: string
          hubspot_contact_id?: string | null
          id?: string
          notes?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prospects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsors_vendors: {
        Row: {
          company_name: string
          contact_name: string | null
          created_at: string | null
          created_by: string | null
          email: string
          hubspot_deal_id: string | null
          id: string
          notes: string | null
          partnership_type: string | null
          status: string | null
        }
        Insert: {
          company_name: string
          contact_name?: string | null
          created_at?: string | null
          created_by?: string | null
          email: string
          hubspot_deal_id?: string | null
          id?: string
          notes?: string | null
          partnership_type?: string | null
          status?: string | null
        }
        Update: {
          company_name?: string
          contact_name?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string
          hubspot_deal_id?: string | null
          id?: string
          notes?: string | null
          partnership_type?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sponsors_vendors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          checked_in_at: string | null
          checked_in_by: string | null
          created_at: string | null
          event_id: string | null
          guest_email: string | null
          guest_name: string | null
          id: string
          source: string | null
          status: string | null
          stripe_payment_id: string | null
          ticket_type: string
          user_id: string | null
        }
        Insert: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          created_at?: string | null
          event_id?: string | null
          guest_email?: string | null
          guest_name?: string | null
          id?: string
          source?: string | null
          status?: string | null
          stripe_payment_id?: string | null
          ticket_type: string
          user_id?: string | null
        }
        Update: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          created_at?: string | null
          event_id?: string | null
          guest_email?: string | null
          guest_name?: string | null
          id?: string
          source?: string | null
          status?: string | null
          stripe_payment_id?: string | null
          ticket_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_ticket_counts: {
        Args: { event_ids: string[] }
        Returns: {
          count: number
          event_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_user: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "member"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "member"],
    },
  },
} as const
