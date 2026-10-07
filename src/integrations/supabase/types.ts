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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_conversation_participants: {
        Row: {
          conversation_id: string
          id: string
          joined_at: string
          last_read_at: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "admin_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_conversation_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_conversations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          partner_id: string | null
          title: string | null
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          partner_id?: string | null
          title?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          partner_id?: string | null
          title?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_conversations_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          file_names: string[]
          file_urls: string[]
          id: string
          image_urls: string[]
          is_edited: boolean
          sender_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          file_names?: string[]
          file_urls?: string[]
          id?: string
          image_urls?: string[]
          is_edited?: boolean
          sender_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          file_names?: string[]
          file_urls?: string[]
          id?: string
          image_urls?: string[]
          is_edited?: boolean
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "admin_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
      admin_resources: {
        Row: {
          created_at: string
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          tags: string[] | null
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          tags?: string[] | null
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          tags?: string[] | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_resources_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          archived_at: string | null
          assigned_to: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string
          deleted_at: string | null
          description: string | null
          due_date: string | null
          id: string
          priority: string | null
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          archived_at?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by: string
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string | null
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          archived_at?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string
          deleted_at?: string | null
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
      admin_users: {
        Row: {
          created_at: string | null
          email: string
          id: string
          role: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          role?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          role?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      agent_memory: {
        Row: {
          agent_slug: string
          content: string
          created_at: string
          expires_at: string | null
          id: string
          memory_type: string
          person_id: string
          weight: number
        }
        Insert: {
          agent_slug: string
          content: string
          created_at?: string
          expires_at?: string | null
          id?: string
          memory_type: string
          person_id: string
          weight?: number
        }
        Update: {
          agent_slug?: string
          content?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          memory_type?: string
          person_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_memory_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      ambassador_payouts: {
        Row: {
          ambassador_id: string
          amount_cents: number
          created_at: string
          failed_at: string | null
          failure_reason: string | null
          id: string
          paid_at: string | null
          referral_id: string
          sent_at: string | null
          status: string
          stripe_payout_id: string | null
          stripe_transfer_id: string | null
        }
        Insert: {
          ambassador_id: string
          amount_cents: number
          created_at?: string
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          paid_at?: string | null
          referral_id: string
          sent_at?: string | null
          status?: string
          stripe_payout_id?: string | null
          stripe_transfer_id?: string | null
        }
        Update: {
          ambassador_id?: string
          amount_cents?: number
          created_at?: string
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          paid_at?: string | null
          referral_id?: string
          sent_at?: string | null
          status?: string
          stripe_payout_id?: string | null
          stripe_transfer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ambassador_payouts_ambassador_id_fkey"
            columns: ["ambassador_id"]
            isOneToOne: false
            referencedRelation: "ambassadors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ambassador_payouts_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "ambassador_referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      ambassador_referrals: {
        Row: {
          abuse_flags: Json | null
          ambassador_id: string
          ambassador_person_id: string | null
          approved_at: string | null
          approved_by: string | null
          commission_earned_at: string | null
          converted_at: string | null
          created_at: string
          denied_at: string | null
          denied_reason: string | null
          first_payment_at: string | null
          id: string
          paid_at: string | null
          payment_method_fingerprint: string | null
          payout_notes: string | null
          payout_sent_at: string | null
          payout_status: string
          referral_code: string | null
          referred_at: string | null
          referred_email: string
          referred_full_name: string | null
          referred_person_id: string | null
          referred_profile_id: string | null
          reward_cents: number
          signup_ip: string | null
          signup_user_agent: string | null
          status: string
          stripe_session_id: string | null
          stripe_subscription_id: string | null
          stripe_transfer_id: string | null
          tier: string
        }
        Insert: {
          abuse_flags?: Json | null
          ambassador_id: string
          ambassador_person_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          commission_earned_at?: string | null
          converted_at?: string | null
          created_at?: string
          denied_at?: string | null
          denied_reason?: string | null
          first_payment_at?: string | null
          id?: string
          paid_at?: string | null
          payment_method_fingerprint?: string | null
          payout_notes?: string | null
          payout_sent_at?: string | null
          payout_status?: string
          referral_code?: string | null
          referred_at?: string | null
          referred_email: string
          referred_full_name?: string | null
          referred_person_id?: string | null
          referred_profile_id?: string | null
          reward_cents: number
          signup_ip?: string | null
          signup_user_agent?: string | null
          status?: string
          stripe_session_id?: string | null
          stripe_subscription_id?: string | null
          stripe_transfer_id?: string | null
          tier: string
        }
        Update: {
          abuse_flags?: Json | null
          ambassador_id?: string
          ambassador_person_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          commission_earned_at?: string | null
          converted_at?: string | null
          created_at?: string
          denied_at?: string | null
          denied_reason?: string | null
          first_payment_at?: string | null
          id?: string
          paid_at?: string | null
          payment_method_fingerprint?: string | null
          payout_notes?: string | null
          payout_sent_at?: string | null
          payout_status?: string
          referral_code?: string | null
          referred_at?: string | null
          referred_email?: string
          referred_full_name?: string | null
          referred_person_id?: string | null
          referred_profile_id?: string | null
          reward_cents?: number
          signup_ip?: string | null
          signup_user_agent?: string | null
          status?: string
          stripe_session_id?: string | null
          stripe_subscription_id?: string | null
          stripe_transfer_id?: string | null
          tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "ambassador_referrals_ambassador_id_fkey"
            columns: ["ambassador_id"]
            isOneToOne: false
            referencedRelation: "ambassadors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ambassador_referrals_ambassador_person_id_fkey"
            columns: ["ambassador_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ambassador_referrals_referred_person_id_fkey"
            columns: ["referred_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      ambassadors: {
        Row: {
          approved_social_referrals_count: number
          business_reward_cents: number
          created_at: string
          created_by: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean
          notes: string | null
          phone: string | null
          profile_id: string | null
          referral_code: string
          social_reward_cents: number
          stripe_account_id: string | null
          stripe_account_status: string | null
          stripe_onboarding_completed_at: string | null
          type: string
          updated_at: string
        }
        Insert: {
          approved_social_referrals_count?: number
          business_reward_cents?: number
          created_at?: string
          created_by?: string | null
          email: string
          full_name: string
          id?: string
          is_active?: boolean
          notes?: string | null
          phone?: string | null
          profile_id?: string | null
          referral_code: string
          social_reward_cents?: number
          stripe_account_id?: string | null
          stripe_account_status?: string | null
          stripe_onboarding_completed_at?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          approved_social_referrals_count?: number
          business_reward_cents?: number
          created_at?: string
          created_by?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          phone?: string | null
          profile_id?: string | null
          referral_code?: string
          social_reward_cents?: number
          stripe_account_id?: string | null
          stripe_account_status?: string | null
          stripe_onboarding_completed_at?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ambassadors_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      apple_wallet_passes: {
        Row: {
          auth_token: string
          created_at: string
          last_updated: string
          person_id: string | null
          serial_number: string
        }
        Insert: {
          auth_token: string
          created_at?: string
          last_updated?: string
          person_id?: string | null
          serial_number: string
        }
        Update: {
          auth_token?: string
          created_at?: string
          last_updated?: string
          person_id?: string | null
          serial_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "apple_wallet_passes_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      apple_wallet_registrations: {
        Row: {
          created_at: string
          device_id: string
          id: string
          push_token: string
          serial_number: string
        }
        Insert: {
          created_at?: string
          device_id: string
          id?: string
          push_token: string
          serial_number: string
        }
        Update: {
          created_at?: string
          device_id?: string
          id?: string
          push_token?: string
          serial_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "apple_wallet_registrations_serial_number_fkey"
            columns: ["serial_number"]
            isOneToOne: false
            referencedRelation: "apple_wallet_passes"
            referencedColumns: ["serial_number"]
          },
        ]
      }
      applications: {
        Row: {
          business_name: string
          contact_name: string
          created_at: string | null
          email: string
          id: string
          message: string | null
          partner_types: string[]
          phone: string | null
          status: string | null
          updated_at: string | null
          user_id: string | null
          website: string | null
        }
        Insert: {
          business_name: string
          contact_name: string
          created_at?: string | null
          email: string
          id?: string
          message?: string | null
          partner_types?: string[]
          phone?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
          website?: string | null
        }
        Update: {
          business_name?: string
          contact_name?: string
          created_at?: string | null
          email?: string
          id?: string
          message?: string | null
          partner_types?: string[]
          phone?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
          website?: string | null
        }
        Relationships: []
      }
      attendance_credentials: {
        Row: {
          apple_pass_serial: string | null
          checked_in_at: string | null
          checked_in_by: string | null
          created_at: string
          credential_type: string
          event_id: string | null
          expires_at: string | null
          google_pass_object_id: string | null
          id: string
          issued_by_person_id: string | null
          metadata: Json | null
          person_id: string
          status: string
          token: string
          updated_at: string
          used_at: string | null
          wallet_status: string | null
        }
        Insert: {
          apple_pass_serial?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          created_at?: string
          credential_type: string
          event_id?: string | null
          expires_at?: string | null
          google_pass_object_id?: string | null
          id?: string
          issued_by_person_id?: string | null
          metadata?: Json | null
          person_id: string
          status?: string
          token: string
          updated_at?: string
          used_at?: string | null
          wallet_status?: string | null
        }
        Update: {
          apple_pass_serial?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          created_at?: string
          credential_type?: string
          event_id?: string | null
          expires_at?: string | null
          google_pass_object_id?: string | null
          id?: string
          issued_by_person_id?: string | null
          metadata?: Json | null
          person_id?: string
          status?: string
          token?: string
          updated_at?: string
          used_at?: string | null
          wallet_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_credentials_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_credentials_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_credentials_issued_by_person_id_fkey"
            columns: ["issued_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_credentials_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      best_time_to_post: {
        Row: {
          day_of_week: number
          engagement_score: number
          hour_of_day: number
          id: string
          sample_size: number
          social_account_id: string
          updated_at: string
        }
        Insert: {
          day_of_week: number
          engagement_score?: number
          hour_of_day: number
          id?: string
          sample_size?: number
          social_account_id: string
          updated_at?: string
        }
        Update: {
          day_of_week?: number
          engagement_score?: number
          hour_of_day?: number
          id?: string
          sample_size?: number
          social_account_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "best_time_to_post_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          author: string | null
          canonical_url: string | null
          content: string
          cover_image_alt: string | null
          cover_image_url: string | null
          created_at: string | null
          excerpt: string | null
          focus_keyword: string | null
          id: string
          instagram_embed_url: string | null
          meta_description: string | null
          meta_title: string | null
          og_image_url: string | null
          published_at: string | null
          reading_time_minutes: number | null
          related_post_ids: string[] | null
          schema_type: string
          show_table_of_contents: boolean
          slug: string
          status: string | null
          tags: string[] | null
          tiktok_embed_url: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          author?: string | null
          canonical_url?: string | null
          content: string
          cover_image_alt?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          excerpt?: string | null
          focus_keyword?: string | null
          id?: string
          instagram_embed_url?: string | null
          meta_description?: string | null
          meta_title?: string | null
          og_image_url?: string | null
          published_at?: string | null
          reading_time_minutes?: number | null
          related_post_ids?: string[] | null
          schema_type?: string
          show_table_of_contents?: boolean
          slug: string
          status?: string | null
          tags?: string[] | null
          tiktok_embed_url?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          author?: string | null
          canonical_url?: string | null
          content?: string
          cover_image_alt?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          excerpt?: string | null
          focus_keyword?: string | null
          id?: string
          instagram_embed_url?: string | null
          meta_description?: string | null
          meta_title?: string | null
          og_image_url?: string | null
          published_at?: string | null
          reading_time_minutes?: number | null
          related_post_ids?: string[] | null
          schema_type?: string
          show_table_of_contents?: boolean
          slug?: string
          status?: string | null
          tags?: string[] | null
          tiktok_embed_url?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      business_applications: {
        Row: {
          admin_notes: string | null
          ambassador_id: string | null
          anything_else: string | null
          approved_at: string | null
          billing_plan: string | null
          card_saved: boolean | null
          company: string | null
          confirmation_sent_at: string | null
          confirmed_referrer_profile_id: string | null
          conflict_lesson: string | null
          created_at: string | null
          decision_email_sent_at: string | null
          email: string
          first_name: string
          goals: string | null
          id: string
          industry: string | null
          last_name: string
          linkedin_url: string | null
          matched_referrer_profile_id: string | null
          missing_in_charlotte: string | null
          one_year_goal: string | null
          phone: string | null
          profile_id: string | null
          recent_wins: string | null
          referral_code: string | null
          referral_source: string | null
          referrer_name: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          right_intro: string | null
          status: string | null
          stripe_customer_id: string | null
          stripe_payment_method_id: string | null
          stripe_setup_intent_id: string | null
          stripe_subscription_id: string | null
          title: string | null
          updated_at: string | null
          website: string | null
          what_bring: string | null
          why_join: string | null
          years_in_charlotte: number | null
        }
        Insert: {
          admin_notes?: string | null
          ambassador_id?: string | null
          anything_else?: string | null
          approved_at?: string | null
          billing_plan?: string | null
          card_saved?: boolean | null
          company?: string | null
          confirmation_sent_at?: string | null
          confirmed_referrer_profile_id?: string | null
          conflict_lesson?: string | null
          created_at?: string | null
          decision_email_sent_at?: string | null
          email: string
          first_name: string
          goals?: string | null
          id?: string
          industry?: string | null
          last_name: string
          linkedin_url?: string | null
          matched_referrer_profile_id?: string | null
          missing_in_charlotte?: string | null
          one_year_goal?: string | null
          phone?: string | null
          profile_id?: string | null
          recent_wins?: string | null
          referral_code?: string | null
          referral_source?: string | null
          referrer_name?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          right_intro?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          stripe_setup_intent_id?: string | null
          stripe_subscription_id?: string | null
          title?: string | null
          updated_at?: string | null
          website?: string | null
          what_bring?: string | null
          why_join?: string | null
          years_in_charlotte?: number | null
        }
        Update: {
          admin_notes?: string | null
          ambassador_id?: string | null
          anything_else?: string | null
          approved_at?: string | null
          billing_plan?: string | null
          card_saved?: boolean | null
          company?: string | null
          confirmation_sent_at?: string | null
          confirmed_referrer_profile_id?: string | null
          conflict_lesson?: string | null
          created_at?: string | null
          decision_email_sent_at?: string | null
          email?: string
          first_name?: string
          goals?: string | null
          id?: string
          industry?: string | null
          last_name?: string
          linkedin_url?: string | null
          matched_referrer_profile_id?: string | null
          missing_in_charlotte?: string | null
          one_year_goal?: string | null
          phone?: string | null
          profile_id?: string | null
          recent_wins?: string | null
          referral_code?: string | null
          referral_source?: string | null
          referrer_name?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          right_intro?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          stripe_setup_intent_id?: string | null
          stripe_subscription_id?: string | null
          title?: string | null
          updated_at?: string | null
          website?: string | null
          what_bring?: string | null
          why_join?: string | null
          years_in_charlotte?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "business_applications_ambassador_id_fkey"
            columns: ["ambassador_id"]
            isOneToOne: false
            referencedRelation: "ambassadors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_applications_confirmed_referrer_fkey"
            columns: ["confirmed_referrer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_applications_matched_referrer_fkey"
            columns: ["matched_referrer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_applications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business_cards: {
        Row: {
          avatar_url: string | null
          company: string | null
          created_at: string
          custom_fields: Json | null
          email: string | null
          full_name: string | null
          id: string
          linkedin_url: string | null
          phone: string | null
          public_id: string
          title: string | null
          updated_at: string
          user_id: string
          website_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          custom_fields?: Json | null
          email?: string | null
          full_name?: string | null
          id?: string
          linkedin_url?: string | null
          phone?: string | null
          public_id: string
          title?: string | null
          updated_at?: string
          user_id: string
          website_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          custom_fields?: Json | null
          email?: string | null
          full_name?: string | null
          id?: string
          linkedin_url?: string | null
          phone?: string | null
          public_id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_cards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business_profiles: {
        Row: {
          additional_photos: string[] | null
          bio: string | null
          card_accent: string | null
          card_background: string | null
          company_name: string | null
          created_at: string | null
          facebook_url: string | null
          id: string
          industry: string | null
          instagram_url: string | null
          is_visible: boolean
          linkedin_url: string | null
          logo_url: string | null
          looking_for: string[] | null
          phone: string | null
          services: string[] | null
          tiktok_url: string | null
          title: string | null
          updated_at: string | null
          user_id: string
          website_url: string | null
        }
        Insert: {
          additional_photos?: string[] | null
          bio?: string | null
          card_accent?: string | null
          card_background?: string | null
          company_name?: string | null
          created_at?: string | null
          facebook_url?: string | null
          id?: string
          industry?: string | null
          instagram_url?: string | null
          is_visible?: boolean
          linkedin_url?: string | null
          logo_url?: string | null
          looking_for?: string[] | null
          phone?: string | null
          services?: string[] | null
          tiktok_url?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
          website_url?: string | null
        }
        Update: {
          additional_photos?: string[] | null
          bio?: string | null
          card_accent?: string | null
          card_background?: string | null
          company_name?: string | null
          created_at?: string | null
          facebook_url?: string | null
          id?: string
          industry?: string | null
          instagram_url?: string | null
          is_visible?: boolean
          linkedin_url?: string | null
          logo_url?: string | null
          looking_for?: string[] | null
          phone?: string | null
          services?: string[] | null
          tiktok_url?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cancellation_surveys: {
        Row: {
          created_at: string | null
          feedback: string | null
          id: string
          profile_id: string | null
          reason: string | null
          would_rejoin: boolean | null
        }
        Insert: {
          created_at?: string | null
          feedback?: string | null
          id?: string
          profile_id?: string | null
          reason?: string | null
          would_rejoin?: boolean | null
        }
        Update: {
          created_at?: string | null
          feedback?: string | null
          id?: string
          profile_id?: string | null
          reason?: string | null
          would_rejoin?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "cancellation_surveys_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_activity: {
        Row: {
          activity_type: string
          contact_id: string | null
          created_at: string | null
          description: string | null
          id: string
          metadata: Json | null
          person_id: string | null
          profile_id: string | null
          title: string
        }
        Insert: {
          activity_type: string
          contact_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          person_id?: string | null
          profile_id?: string | null
          title: string
        }
        Update: {
          activity_type?: string
          contact_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          person_id?: string | null
          profile_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_activity_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_activity_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_activity_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_notes: {
        Row: {
          author_id: string
          contact_id: string
          content: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          contact_id: string
          content: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          contact_id?: string
          content?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_tags: {
        Row: {
          contact_id: string
          created_at: string | null
          id: string
          tag: string
        }
        Insert: {
          contact_id: string
          created_at?: string | null
          id?: string
          tag: string
        }
        Update: {
          contact_id?: string
          created_at?: string | null
          id?: string
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tags_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          company: string | null
          contact_type: string | null
          converted_at: string | null
          converted_to_member_id: string | null
          created_at: string | null
          email: string
          first_seen_at: string | null
          full_name: string | null
          id: string
          last_activity_at: string | null
          lead_score: number | null
          metadata: Json | null
          person_id: string | null
          phone: string | null
          sms_consent: boolean
          sms_consent_at: string | null
          social_handles: Json
          source: string | null
          source_detail: string | null
          status: string | null
          unsubscribed: boolean | null
          unsubscribed_at: string | null
          unsubscribed_reason: string | null
          updated_at: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          company?: string | null
          contact_type?: string | null
          converted_at?: string | null
          converted_to_member_id?: string | null
          created_at?: string | null
          email: string
          first_seen_at?: string | null
          full_name?: string | null
          id?: string
          last_activity_at?: string | null
          lead_score?: number | null
          metadata?: Json | null
          person_id?: string | null
          phone?: string | null
          sms_consent?: boolean
          sms_consent_at?: string | null
          social_handles?: Json
          source?: string | null
          source_detail?: string | null
          status?: string | null
          unsubscribed?: boolean | null
          unsubscribed_at?: string | null
          unsubscribed_reason?: string | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          company?: string | null
          contact_type?: string | null
          converted_at?: string | null
          converted_to_member_id?: string | null
          created_at?: string | null
          email?: string
          first_seen_at?: string | null
          full_name?: string | null
          id?: string
          last_activity_at?: string | null
          lead_score?: number | null
          metadata?: Json | null
          person_id?: string | null
          phone?: string | null
          sms_consent?: boolean
          sms_consent_at?: string | null
          social_handles?: Json
          source?: string | null
          source_detail?: string | null
          status?: string | null
          unsubscribed?: boolean | null
          unsubscribed_at?: string | null
          unsubscribed_reason?: string | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_converted_to_member_id_fkey"
            columns: ["converted_to_member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          id: string
          joined_at: string | null
          last_read_at: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          joined_at?: string | null
          last_read_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          joined_at?: string | null
          last_read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          name: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_ad_accounts: {
        Row: {
          access_token: string | null
          account_id: string
          account_name: string
          connected_at: string | null
          connected_by: string | null
          created_at: string | null
          id: string
          is_connected: boolean | null
          last_sync_at: string | null
          platform: string
          updated_at: string | null
        }
        Insert: {
          access_token?: string | null
          account_id: string
          account_name: string
          connected_at?: string | null
          connected_by?: string | null
          created_at?: string | null
          id?: string
          is_connected?: boolean | null
          last_sync_at?: string | null
          platform: string
          updated_at?: string | null
        }
        Update: {
          access_token?: string | null
          account_id?: string
          account_name?: string
          connected_at?: string | null
          connected_by?: string | null
          created_at?: string | null
          id?: string
          is_connected?: boolean | null
          last_sync_at?: string | null
          platform?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_ad_accounts_connected_by_fkey"
            columns: ["connected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_ad_performance: {
        Row: {
          ad_account_id: string
          ad_name: string | null
          ad_set_name: string | null
          campaign_name: string | null
          clicks: number | null
          conversions: number | null
          cpc: number | null
          ctr: number | null
          date: string
          id: string
          impressions: number | null
          platform_campaign_id: string | null
          revenue: number | null
          roas: number | null
          spend: number | null
          synced_at: string | null
        }
        Insert: {
          ad_account_id: string
          ad_name?: string | null
          ad_set_name?: string | null
          campaign_name?: string | null
          clicks?: number | null
          conversions?: number | null
          cpc?: number | null
          ctr?: number | null
          date: string
          id?: string
          impressions?: number | null
          platform_campaign_id?: string | null
          revenue?: number | null
          roas?: number | null
          spend?: number | null
          synced_at?: string | null
        }
        Update: {
          ad_account_id?: string
          ad_name?: string | null
          ad_set_name?: string | null
          campaign_name?: string | null
          clicks?: number | null
          conversions?: number | null
          cpc?: number | null
          ctr?: number | null
          date?: string
          id?: string
          impressions?: number | null
          platform_campaign_id?: string | null
          revenue?: number | null
          roas?: number | null
          spend?: number | null
          synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_ad_performance_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "crm_ad_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_conversions: {
        Row: {
          contact_id: string | null
          conversion_type: string
          converted_at: string | null
          id: string
          profile_id: string | null
          revenue: number | null
          source_detail: string | null
          source_id: string | null
          source_type: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          contact_id?: string | null
          conversion_type: string
          converted_at?: string | null
          id?: string
          profile_id?: string | null
          revenue?: number | null
          source_detail?: string | null
          source_id?: string | null
          source_type?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          contact_id?: string | null
          conversion_type?: string
          converted_at?: string | null
          id?: string
          profile_id?: string | null
          revenue?: number | null
          source_detail?: string | null
          source_id?: string | null
          source_type?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_conversions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_conversions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_dashboard_widgets: {
        Row: {
          config: Json | null
          created_at: string | null
          dashboard_id: string
          height: number | null
          id: string
          position_x: number | null
          position_y: number | null
          title: string | null
          updated_at: string | null
          widget_type: string
          width: number | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          dashboard_id: string
          height?: number | null
          id?: string
          position_x?: number | null
          position_y?: number | null
          title?: string | null
          updated_at?: string | null
          widget_type: string
          width?: number | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          dashboard_id?: string
          height?: number | null
          id?: string
          position_x?: number | null
          position_y?: number | null
          title?: string | null
          updated_at?: string | null
          widget_type?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_dashboard_widgets_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "crm_dashboards"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_dashboards: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_default: boolean | null
          is_shared: boolean | null
          layout: Json | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          is_shared?: boolean | null
          layout?: Json | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          is_shared?: boolean | null
          layout?: Json | null
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_dashboards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_deals: {
        Row: {
          application_data: Json | null
          applied_at: string | null
          assigned_to: string | null
          closed_at: string | null
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          deal_type: string | null
          denial_reason: string | null
          id: string
          industry: string | null
          internal_notes: string | null
          last_stage_change_at: string | null
          name: string
          notes: string | null
          profile_id: string | null
          stage: string
          stripe_setup_intent_id: string | null
          updated_at: string | null
          value: number | null
          waitlist_reason: string | null
        }
        Insert: {
          application_data?: Json | null
          applied_at?: string | null
          assigned_to?: string | null
          closed_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_type?: string | null
          denial_reason?: string | null
          id?: string
          industry?: string | null
          internal_notes?: string | null
          last_stage_change_at?: string | null
          name: string
          notes?: string | null
          profile_id?: string | null
          stage?: string
          stripe_setup_intent_id?: string | null
          updated_at?: string | null
          value?: number | null
          waitlist_reason?: string | null
        }
        Update: {
          application_data?: Json | null
          applied_at?: string | null
          assigned_to?: string | null
          closed_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_type?: string | null
          denial_reason?: string | null
          id?: string
          industry?: string | null
          internal_notes?: string | null
          last_stage_change_at?: string | null
          name?: string
          notes?: string | null
          profile_id?: string | null
          stage?: string
          stripe_setup_intent_id?: string | null
          updated_at?: string | null
          value?: number | null
          waitlist_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_deals_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_form_fields: {
        Row: {
          created_at: string | null
          field_order: number
          field_type: string
          form_id: string
          help_text: string | null
          id: string
          is_required: boolean | null
          label: string
          maps_to_field: string | null
          options: Json | null
          placeholder: string | null
        }
        Insert: {
          created_at?: string | null
          field_order: number
          field_type: string
          form_id: string
          help_text?: string | null
          id?: string
          is_required?: boolean | null
          label: string
          maps_to_field?: string | null
          options?: Json | null
          placeholder?: string | null
        }
        Update: {
          created_at?: string | null
          field_order?: number
          field_type?: string
          form_id?: string
          help_text?: string | null
          id?: string
          is_required?: boolean | null
          label?: string
          maps_to_field?: string | null
          options?: Json | null
          placeholder?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_form_fields_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "crm_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_form_submissions: {
        Row: {
          contact_id: string | null
          data: Json
          deal_id: string | null
          form_id: string
          id: string
          ip_address: string | null
          submitted_at: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          contact_id?: string | null
          data?: Json
          deal_id?: string | null
          form_id: string
          id?: string
          ip_address?: string | null
          submitted_at?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          contact_id?: string | null
          data?: Json
          deal_id?: string | null
          form_id?: string
          id?: string
          ip_address?: string | null
          submitted_at?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_form_submissions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_form_submissions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "crm_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_form_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "crm_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_forms: {
        Row: {
          auto_create_contact: boolean | null
          auto_create_deal: boolean | null
          auto_enroll_drip_id: string | null
          created_at: string | null
          created_by: string | null
          deal_stage: string | null
          description: string | null
          form_type: string | null
          id: string
          name: string
          notify_email: string | null
          redirect_url: string | null
          slug: string
          status: string | null
          submit_button_text: string | null
          success_message: string | null
          updated_at: string | null
        }
        Insert: {
          auto_create_contact?: boolean | null
          auto_create_deal?: boolean | null
          auto_enroll_drip_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_stage?: string | null
          description?: string | null
          form_type?: string | null
          id?: string
          name: string
          notify_email?: string | null
          redirect_url?: string | null
          slug: string
          status?: string | null
          submit_button_text?: string | null
          success_message?: string | null
          updated_at?: string | null
        }
        Update: {
          auto_create_contact?: boolean | null
          auto_create_deal?: boolean | null
          auto_enroll_drip_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_stage?: string | null
          description?: string | null
          form_type?: string | null
          id?: string
          name?: string
          notify_email?: string | null
          redirect_url?: string | null
          slug?: string
          status?: string | null
          submit_button_text?: string | null
          success_message?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_forms_auto_enroll_drip_id_fkey"
            columns: ["auto_enroll_drip_id"]
            isOneToOne: false
            referencedRelation: "drip_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_forms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_renewal_reminders: {
        Row: {
          created_at: string | null
          days_before: number | null
          id: string
          profile_id: string
          reminder_type: string
          resend_message_id: string | null
          scheduled_for: string
          sent_at: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          days_before?: number | null
          id?: string
          profile_id: string
          reminder_type: string
          resend_message_id?: string | null
          scheduled_for: string
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          days_before?: number | null
          id?: string
          profile_id?: string
          reminder_type?: string
          resend_message_id?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_renewal_reminders_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_sequence_enrollments: {
        Row: {
          completed_at: string | null
          contact_id: string | null
          current_step: number | null
          enrolled_at: string | null
          id: string
          next_send_at: string | null
          profile_id: string | null
          sequence_id: string
          status: string | null
          stopped_reason: string | null
        }
        Insert: {
          completed_at?: string | null
          contact_id?: string | null
          current_step?: number | null
          enrolled_at?: string | null
          id?: string
          next_send_at?: string | null
          profile_id?: string | null
          sequence_id: string
          status?: string | null
          stopped_reason?: string | null
        }
        Update: {
          completed_at?: string | null
          contact_id?: string | null
          current_step?: number | null
          enrolled_at?: string | null
          id?: string
          next_send_at?: string | null
          profile_id?: string | null
          sequence_id?: string
          status?: string | null
          stopped_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_sequence_enrollments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_sequence_enrollments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_sequence_enrollments_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "crm_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_sequence_steps: {
        Row: {
          body_html: string
          body_json: Json | null
          created_at: string | null
          delay_days: number | null
          id: string
          sequence_id: string
          step_number: number
          subject: string
        }
        Insert: {
          body_html: string
          body_json?: Json | null
          created_at?: string | null
          delay_days?: number | null
          id?: string
          sequence_id: string
          step_number: number
          subject: string
        }
        Update: {
          body_html?: string
          body_json?: Json | null
          created_at?: string | null
          delay_days?: number | null
          id?: string
          sequence_id?: string
          step_number?: number
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_sequence_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "crm_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_sequences: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          name: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_sequences_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_survey_questions: {
        Row: {
          created_at: string | null
          id: string
          is_required: boolean | null
          options: Json | null
          question_order: number
          question_text: string
          question_type: string
          survey_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_required?: boolean | null
          options?: Json | null
          question_order: number
          question_text: string
          question_type: string
          survey_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_required?: boolean | null
          options?: Json | null
          question_order?: number
          question_text?: string
          question_type?: string
          survey_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_survey_questions_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "crm_surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_survey_responses: {
        Row: {
          contact_id: string | null
          id: string
          nps_score: number | null
          profile_id: string | null
          responses: Json
          submitted_at: string | null
          survey_id: string
        }
        Insert: {
          contact_id?: string | null
          id?: string
          nps_score?: number | null
          profile_id?: string | null
          responses?: Json
          submitted_at?: string | null
          survey_id: string
        }
        Update: {
          contact_id?: string | null
          id?: string
          nps_score?: number | null
          profile_id?: string | null
          responses?: Json
          submitted_at?: string | null
          survey_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_survey_responses_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_survey_responses_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_survey_responses_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "crm_surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_surveys: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          name: string
          send_delay_hours: number | null
          status: string | null
          trigger_event_id: string | null
          trigger_type: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          send_delay_hours?: number | null
          status?: string | null
          trigger_event_id?: string | null
          trigger_type?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          send_delay_hours?: number | null
          status?: string | null
          trigger_event_id?: string | null
          trigger_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_surveys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_surveys_trigger_event_id_fkey"
            columns: ["trigger_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      drift_checks: {
        Row: {
          alert_count: number
          alert_sent: boolean
          duration_ms: number | null
          flagged: Json
          id: string
          notes: string | null
          profiles_total: number
          ran_at: string
          shape_counts: Json
          source: string
          stripe_active: number
          stripe_subscriptions_total: number
        }
        Insert: {
          alert_count?: number
          alert_sent?: boolean
          duration_ms?: number | null
          flagged?: Json
          id?: string
          notes?: string | null
          profiles_total: number
          ran_at?: string
          shape_counts?: Json
          source?: string
          stripe_active: number
          stripe_subscriptions_total: number
        }
        Update: {
          alert_count?: number
          alert_sent?: boolean
          duration_ms?: number | null
          flagged?: Json
          id?: string
          notes?: string | null
          profiles_total?: number
          ran_at?: string
          shape_counts?: Json
          source?: string
          stripe_active?: number
          stripe_subscriptions_total?: number
        }
        Relationships: []
      }
      drip_campaigns: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          name: string
          status: string | null
          stop_on_conversion: boolean | null
          trigger_config: Json | null
          trigger_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          status?: string | null
          stop_on_conversion?: boolean | null
          trigger_config?: Json | null
          trigger_type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          status?: string | null
          stop_on_conversion?: boolean | null
          trigger_config?: Json | null
          trigger_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drip_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      drip_enrollments: {
        Row: {
          completed_at: string | null
          contact_email: string
          contact_name: string | null
          current_step: number | null
          drip_campaign_id: string
          enrolled_at: string | null
          id: string
          last_sent_at: string | null
          metadata: Json | null
          next_send_at: string | null
          status: string | null
          stopped_reason: string | null
        }
        Insert: {
          completed_at?: string | null
          contact_email: string
          contact_name?: string | null
          current_step?: number | null
          drip_campaign_id: string
          enrolled_at?: string | null
          id?: string
          last_sent_at?: string | null
          metadata?: Json | null
          next_send_at?: string | null
          status?: string | null
          stopped_reason?: string | null
        }
        Update: {
          completed_at?: string | null
          contact_email?: string
          contact_name?: string | null
          current_step?: number | null
          drip_campaign_id?: string
          enrolled_at?: string | null
          id?: string
          last_sent_at?: string | null
          metadata?: Json | null
          next_send_at?: string | null
          status?: string | null
          stopped_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drip_enrollments_drip_campaign_id_fkey"
            columns: ["drip_campaign_id"]
            isOneToOne: false
            referencedRelation: "drip_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      drip_steps: {
        Row: {
          body_html: string
          body_json: Json | null
          created_at: string | null
          delay_days: number | null
          delay_hours: number | null
          drip_campaign_id: string
          id: string
          step_number: number
          subject: string
        }
        Insert: {
          body_html: string
          body_json?: Json | null
          created_at?: string | null
          delay_days?: number | null
          delay_hours?: number | null
          drip_campaign_id: string
          id?: string
          step_number: number
          subject: string
        }
        Update: {
          body_html?: string
          body_json?: Json | null
          created_at?: string | null
          delay_days?: number | null
          delay_hours?: number | null
          drip_campaign_id?: string
          id?: string
          step_number?: number
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "drip_steps_drip_campaign_id_fkey"
            columns: ["drip_campaign_id"]
            isOneToOne: false
            referencedRelation: "drip_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          audience: Json | null
          audience_event_id: string | null
          audience_segment_ids: string[] | null
          audience_type: string | null
          body_html: string | null
          body_json: Json | null
          bounce_count: number | null
          click_count: number | null
          created_at: string | null
          created_by: string | null
          delivered_count: number | null
          from_email: string | null
          from_name: string | null
          id: string
          name: string
          open_count: number | null
          preview_text: string | null
          recipient_count: number | null
          scheduled_for: string | null
          sending_at: string | null
          sent_at: string | null
          sent_count: number | null
          status: string | null
          subject: string
          template_id: string | null
          unsubscribe_count: number | null
          updated_at: string | null
          utm_campaign: string | null
          utm_medium: string | null
        }
        Insert: {
          audience?: Json | null
          audience_event_id?: string | null
          audience_segment_ids?: string[] | null
          audience_type?: string | null
          body_html?: string | null
          body_json?: Json | null
          bounce_count?: number | null
          click_count?: number | null
          created_at?: string | null
          created_by?: string | null
          delivered_count?: number | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          name: string
          open_count?: number | null
          preview_text?: string | null
          recipient_count?: number | null
          scheduled_for?: string | null
          sending_at?: string | null
          sent_at?: string | null
          sent_count?: number | null
          status?: string | null
          subject: string
          template_id?: string | null
          unsubscribe_count?: number | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
        }
        Update: {
          audience?: Json | null
          audience_event_id?: string | null
          audience_segment_ids?: string[] | null
          audience_type?: string | null
          body_html?: string | null
          body_json?: Json | null
          bounce_count?: number | null
          click_count?: number | null
          created_at?: string | null
          created_by?: string | null
          delivered_count?: number | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          name?: string
          open_count?: number | null
          preview_text?: string | null
          recipient_count?: number | null
          scheduled_for?: string | null
          sending_at?: string | null
          sent_at?: string | null
          sent_count?: number | null
          status?: string | null
          subject?: string
          template_id?: string | null
          unsubscribe_count?: number | null
          updated_at?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_campaigns_audience_event_id_fkey"
            columns: ["audience_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_log: {
        Row: {
          bounced_at: string | null
          campaign_id: string | null
          click_url: string | null
          clicked_at: string | null
          created_at: string | null
          delivered_at: string | null
          drip_campaign_id: string | null
          drip_enrollment_id: string | null
          failed_at: string | null
          failure_reason: string | null
          from_email: string | null
          id: string
          metadata: Json | null
          open_count: number | null
          opened_at: string | null
          profile_id: string | null
          reply_to: string | null
          resend_id: string | null
          resend_message_id: string | null
          scheduled_for: string | null
          sent_at: string | null
          sequence_id: string | null
          status: string | null
          subject: string
          template: string | null
          to_email: string
          to_name: string | null
        }
        Insert: {
          bounced_at?: string | null
          campaign_id?: string | null
          click_url?: string | null
          clicked_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          drip_campaign_id?: string | null
          drip_enrollment_id?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          from_email?: string | null
          id?: string
          metadata?: Json | null
          open_count?: number | null
          opened_at?: string | null
          profile_id?: string | null
          reply_to?: string | null
          resend_id?: string | null
          resend_message_id?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          sequence_id?: string | null
          status?: string | null
          subject: string
          template?: string | null
          to_email: string
          to_name?: string | null
        }
        Update: {
          bounced_at?: string | null
          campaign_id?: string | null
          click_url?: string | null
          clicked_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          drip_campaign_id?: string | null
          drip_enrollment_id?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          from_email?: string | null
          id?: string
          metadata?: Json | null
          open_count?: number | null
          opened_at?: string | null
          profile_id?: string | null
          reply_to?: string | null
          resend_id?: string | null
          resend_message_id?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          sequence_id?: string | null
          status?: string | null
          subject?: string
          template?: string | null
          to_email?: string
          to_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_drip_enrollment_id_fkey"
            columns: ["drip_enrollment_id"]
            isOneToOne: false
            referencedRelation: "drip_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_html: string
          body_json: Json | null
          created_at: string | null
          created_by: string | null
          id: string
          is_default: boolean | null
          name: string
          preview_text: string | null
          subject: string
          template_type: string | null
          updated_at: string | null
        }
        Insert: {
          body_html: string
          body_json?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          preview_text?: string | null
          subject: string
          template_type?: string | null
          updated_at?: string | null
        }
        Update: {
          body_html?: string
          body_json?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          preview_text?: string | null
          subject?: string
          template_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_discussion_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          deleted_at: string | null
          event_id: string
          id: string
          parent_comment_id: string | null
          post_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          deleted_at?: string | null
          event_id: string
          id?: string
          parent_comment_id?: string | null
          post_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          event_id?: string
          id?: string
          parent_comment_id?: string | null
          post_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_discussion_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_discussion_comments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_discussion_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "event_discussion_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_discussion_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "event_discussion_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      event_discussion_likes: {
        Row: {
          comment_id: string | null
          created_at: string
          event_id: string
          id: string
          post_id: string | null
          user_id: string
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          event_id: string
          id?: string
          post_id?: string | null
          user_id: string
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          event_id?: string
          id?: string
          post_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_discussion_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "event_discussion_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_discussion_likes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_discussion_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "event_discussion_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_discussion_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_discussion_mentions: {
        Row: {
          comment_id: string | null
          created_at: string
          event_id: string
          id: string
          mentioned_by_id: string
          mentioned_user_id: string
          post_id: string | null
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          event_id: string
          id?: string
          mentioned_by_id: string
          mentioned_user_id: string
          post_id?: string | null
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          event_id?: string
          id?: string
          mentioned_by_id?: string
          mentioned_user_id?: string
          post_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_discussion_mentions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "event_discussion_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_discussion_mentions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_discussion_mentions_mentioned_by_id_fkey"
            columns: ["mentioned_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_discussion_mentions_mentioned_user_id_fkey"
            columns: ["mentioned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_discussion_mentions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "event_discussion_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      event_discussion_photos: {
        Row: {
          created_at: string
          deleted_at: string | null
          event_id: string
          file_size_bytes: number | null
          height: number | null
          id: string
          media_type: string
          source: string
          source_post_id: string | null
          thumbnail_url: string | null
          uploader_id: string
          url: string
          width: number | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          event_id: string
          file_size_bytes?: number | null
          height?: number | null
          id?: string
          media_type?: string
          source?: string
          source_post_id?: string | null
          thumbnail_url?: string | null
          uploader_id: string
          url: string
          width?: number | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          event_id?: string
          file_size_bytes?: number | null
          height?: number | null
          id?: string
          media_type?: string
          source?: string
          source_post_id?: string | null
          thumbnail_url?: string | null
          uploader_id?: string
          url?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "event_discussion_photos_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_discussion_photos_source_post_id_fkey"
            columns: ["source_post_id"]
            isOneToOne: false
            referencedRelation: "event_discussion_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_discussion_photos_uploader_id_fkey"
            columns: ["uploader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_discussion_posts: {
        Row: {
          author_id: string
          content: string | null
          created_at: string
          deleted_at: string | null
          event_id: string
          id: string
          image_urls: string[]
          updated_at: string
        }
        Insert: {
          author_id: string
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          event_id: string
          id?: string
          image_urls?: string[]
          updated_at?: string
        }
        Update: {
          author_id?: string
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          event_id?: string
          id?: string
          image_urls?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_discussion_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_discussion_posts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_inquiries: {
        Row: {
          amount_offering: number | null
          created_at: string
          custom_details: string | null
          desired_return: string | null
          event_id: string | null
          id: string
          inquiry_type: string
          message: string
          partner_id: string
          status: string
          updated_at: string
          venue_address: string | null
          venue_capacity: number | null
          venue_hours: string | null
          venue_other_info: string | null
        }
        Insert: {
          amount_offering?: number | null
          created_at?: string
          custom_details?: string | null
          desired_return?: string | null
          event_id?: string | null
          id?: string
          inquiry_type: string
          message: string
          partner_id: string
          status?: string
          updated_at?: string
          venue_address?: string | null
          venue_capacity?: number | null
          venue_hours?: string | null
          venue_other_info?: string | null
        }
        Update: {
          amount_offering?: number | null
          created_at?: string
          custom_details?: string | null
          desired_return?: string | null
          event_id?: string | null
          id?: string
          inquiry_type?: string
          message?: string
          partner_id?: string
          status?: string
          updated_at?: string
          venue_address?: string | null
          venue_capacity?: number | null
          venue_hours?: string | null
          venue_other_info?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_inquiries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_inquiries_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_inquiry_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          inquiry_id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          inquiry_id: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          inquiry_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_inquiry_messages_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "event_inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_inquiry_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_public_rsvps: {
        Row: {
          checked_in_at: string | null
          checked_in_by: string | null
          contact_id: string | null
          created_at: string
          email: string
          event_id: string
          first_name: string
          id: string
          ip_address: string | null
          last_name: string
          person_id: string | null
          phone: string | null
          sms_consent: boolean | null
          status: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          contact_id?: string | null
          created_at?: string
          email: string
          event_id: string
          first_name: string
          id?: string
          ip_address?: string | null
          last_name: string
          person_id?: string | null
          phone?: string | null
          sms_consent?: boolean | null
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          contact_id?: string | null
          created_at?: string
          email?: string
          event_id?: string
          first_name?: string
          id?: string
          ip_address?: string | null
          last_name?: string
          person_id?: string | null
          phone?: string | null
          sms_consent?: boolean | null
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_public_rsvps_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_public_rsvps_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_public_rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_public_rsvps_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      event_suggestions: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          email: string | null
          full_name: string | null
          id: string
          is_read: boolean | null
          profile_id: string | null
          read_at: string | null
          read_by: string | null
          suggestion: string
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_read?: boolean | null
          profile_id?: string | null
          read_at?: string | null
          read_by?: string | null
          suggestion: string
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_read?: boolean | null
          profile_id?: string | null
          read_at?: string | null
          read_by?: string | null
          suggestion?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_suggestions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_suggestions_read_by_fkey"
            columns: ["read_by"]
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
          access_level_deprecated: string | null
          access_type_deprecated: string | null
          allows_guest_passes: boolean
          business_member_price_deprecated: number | null
          capacity: number | null
          category: string | null
          created_at: string | null
          description: string | null
          discussion_opened_at: string | null
          end_time: string
          event_type: string | null
          eventbrite_event_id: string | null
          eventbrite_published: boolean | null
          eventbrite_url: string | null
          host_id: string | null
          host_slot_price: number | null
          host_slots_count: number
          host_slots_enabled: boolean
          ics_sequence: number
          id: string
          image_url: string | null
          intake_form_slug: string | null
          is_business_only_deprecated: boolean
          is_members_only_deprecated: boolean | null
          is_published: boolean | null
          location_address: string | null
          location_name: string | null
          max_attendees_deprecated: number | null
          member_price_cents: number | null
          occurrence_index: number | null
          open_for_sponsor_inquiry: boolean
          open_for_venue_partner: boolean | null
          parent_event_id: string | null
          price_cents: number
          price_deprecated: number | null
          recurrence_end_date: string | null
          recurrence_rule: string | null
          required_tier: string
          rsvp_opens_at: string | null
          social_member_price_deprecated: number | null
          sponsor_slot_price: number | null
          sponsor_slots_count: number
          sponsor_slots_enabled: boolean
          start_time: string
          tags: string[] | null
          ticket_mode: string
          ticket_price_deprecated: number | null
          title: string
          updated_at: string | null
          vendor_booth_spots_available: number
          vendor_slot_price: number | null
          vendor_slots_count: number
          vendor_slots_enabled: boolean
        }
        Insert: {
          access_level_deprecated?: string | null
          access_type_deprecated?: string | null
          allows_guest_passes?: boolean
          business_member_price_deprecated?: number | null
          capacity?: number | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          discussion_opened_at?: string | null
          end_time: string
          event_type?: string | null
          eventbrite_event_id?: string | null
          eventbrite_published?: boolean | null
          eventbrite_url?: string | null
          host_id?: string | null
          host_slot_price?: number | null
          host_slots_count?: number
          host_slots_enabled?: boolean
          ics_sequence?: number
          id?: string
          image_url?: string | null
          intake_form_slug?: string | null
          is_business_only_deprecated?: boolean
          is_members_only_deprecated?: boolean | null
          is_published?: boolean | null
          location_address?: string | null
          location_name?: string | null
          max_attendees_deprecated?: number | null
          member_price_cents?: number | null
          occurrence_index?: number | null
          open_for_sponsor_inquiry?: boolean
          open_for_venue_partner?: boolean | null
          parent_event_id?: string | null
          price_cents?: number
          price_deprecated?: number | null
          recurrence_end_date?: string | null
          recurrence_rule?: string | null
          required_tier?: string
          rsvp_opens_at?: string | null
          social_member_price_deprecated?: number | null
          sponsor_slot_price?: number | null
          sponsor_slots_count?: number
          sponsor_slots_enabled?: boolean
          start_time: string
          tags?: string[] | null
          ticket_mode?: string
          ticket_price_deprecated?: number | null
          title: string
          updated_at?: string | null
          vendor_booth_spots_available?: number
          vendor_slot_price?: number | null
          vendor_slots_count?: number
          vendor_slots_enabled?: boolean
        }
        Update: {
          access_level_deprecated?: string | null
          access_type_deprecated?: string | null
          allows_guest_passes?: boolean
          business_member_price_deprecated?: number | null
          capacity?: number | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          discussion_opened_at?: string | null
          end_time?: string
          event_type?: string | null
          eventbrite_event_id?: string | null
          eventbrite_published?: boolean | null
          eventbrite_url?: string | null
          host_id?: string | null
          host_slot_price?: number | null
          host_slots_count?: number
          host_slots_enabled?: boolean
          ics_sequence?: number
          id?: string
          image_url?: string | null
          intake_form_slug?: string | null
          is_business_only_deprecated?: boolean
          is_members_only_deprecated?: boolean | null
          is_published?: boolean | null
          location_address?: string | null
          location_name?: string | null
          max_attendees_deprecated?: number | null
          member_price_cents?: number | null
          occurrence_index?: number | null
          open_for_sponsor_inquiry?: boolean
          open_for_venue_partner?: boolean | null
          parent_event_id?: string | null
          price_cents?: number
          price_deprecated?: number | null
          recurrence_end_date?: string | null
          recurrence_rule?: string | null
          required_tier?: string
          rsvp_opens_at?: string | null
          social_member_price_deprecated?: number | null
          sponsor_slot_price?: number | null
          sponsor_slots_count?: number
          sponsor_slots_enabled?: boolean
          start_time?: string
          tags?: string[] | null
          ticket_mode?: string
          ticket_price_deprecated?: number | null
          title?: string
          updated_at?: string | null
          vendor_booth_spots_available?: number
          vendor_slot_price?: number | null
          vendor_slots_count?: number
          vendor_slots_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "events_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_parent_event_id_fkey"
            columns: ["parent_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_intake: {
        Row: {
          contact_id: string | null
          created_at: string
          credential_id: string | null
          email: string
          event_id: string
          first_name: string
          form_variant: string
          id: string
          invite_token: string | null
          ip_address: string | null
          last_name: string
          member_status_at_submit: string | null
          participation: string
          person_id: string | null
          phone: string
          pool: string
          profile_id: string | null
          q_company: string | null
          q_role_title: string | null
          q_seeking: string | null
          q_years_charlotte: string | null
          status: string
          submitted_at: string | null
          updated_at: string
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          credential_id?: string | null
          email: string
          event_id: string
          first_name: string
          form_variant: string
          id?: string
          invite_token?: string | null
          ip_address?: string | null
          last_name: string
          member_status_at_submit?: string | null
          participation: string
          person_id?: string | null
          phone: string
          pool: string
          profile_id?: string | null
          q_company?: string | null
          q_role_title?: string | null
          q_seeking?: string | null
          q_years_charlotte?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          credential_id?: string | null
          email?: string
          event_id?: string
          first_name?: string
          form_variant?: string
          id?: string
          invite_token?: string | null
          ip_address?: string | null
          last_name?: string
          member_status_at_submit?: string | null
          participation?: string
          person_id?: string | null
          phone?: string
          pool?: string
          profile_id?: string | null
          q_company?: string | null
          q_role_title?: string | null
          q_seeking?: string | null
          q_years_charlotte?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exchange_intake_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_intake_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "attendance_credentials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_intake_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_intake_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_intake_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_mixer_config: {
        Row: {
          event_id: string
          format: string
          mixer_cap: number
          planned_rounds: number
          round_duration_seconds: number
          seats_per_table: number
          tables_count: number
          updated_at: string
        }
        Insert: {
          event_id: string
          format?: string
          mixer_cap?: number
          planned_rounds?: number
          round_duration_seconds?: number
          seats_per_table?: number
          tables_count?: number
          updated_at?: string
        }
        Update: {
          event_id?: string
          format?: string
          mixer_cap?: number
          planned_rounds?: number
          round_duration_seconds?: number
          seats_per_table?: number
          tables_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_mixer_config_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_mixer_overrides: {
        Row: {
          credential_id: string
          event_id: string
          included: boolean
          note: string | null
          updated_at: string
        }
        Insert: {
          credential_id: string
          event_id: string
          included: boolean
          note?: string | null
          updated_at?: string
        }
        Update: {
          credential_id?: string
          event_id?: string
          included?: boolean
          note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_mixer_overrides_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "attendance_credentials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_mixer_overrides_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_round_seats: {
        Row: {
          created_at: string
          credential_id: string
          display_name: string
          id: string
          person_id: string | null
          round_id: string
          table_number: number
        }
        Insert: {
          created_at?: string
          credential_id: string
          display_name: string
          id?: string
          person_id?: string | null
          round_id: string
          table_number: number
        }
        Update: {
          created_at?: string
          credential_id?: string
          display_name?: string
          id?: string
          person_id?: string | null
          round_id?: string
          table_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "exchange_round_seats_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "attendance_credentials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_round_seats_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exchange_round_seats_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "exchange_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rounds: {
        Row: {
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          event_id: string
          id: string
          round_number: number
          seats_per_table: number | null
          started_at: string | null
          status: string
          tables_used: number | null
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          event_id: string
          id?: string
          round_number: number
          seats_per_table?: number | null
          started_at?: string | null
          status?: string
          tables_used?: number | null
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          event_id?: string
          id?: string
          round_number?: number
          seats_per_table?: number | null
          started_at?: string | null
          status?: string
          tables_used?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exchange_rounds_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_comments: {
        Row: {
          body: string
          created_at: string | null
          id: string
          post_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string | null
          id?: string
          post_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string | null
          id?: string
          post_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_likes: {
        Row: {
          created_at: string | null
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_mutes: {
        Row: {
          created_at: string | null
          id: string
          muted_user_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          muted_user_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          muted_user_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_mutes_muted_user_id_fkey"
            columns: ["muted_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_mutes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_posts: {
        Row: {
          body: string
          created_at: string | null
          feed_type: string
          id: string
          images: string[] | null
          is_shadow_hidden: boolean
          shadow_hidden_at: string | null
          shadow_hidden_by: string | null
          updated_at: string | null
          user_id: string
          video_url: string | null
        }
        Insert: {
          body: string
          created_at?: string | null
          feed_type?: string
          id?: string
          images?: string[] | null
          is_shadow_hidden?: boolean
          shadow_hidden_at?: string | null
          shadow_hidden_by?: string | null
          updated_at?: string | null
          user_id: string
          video_url?: string | null
        }
        Update: {
          body?: string
          created_at?: string | null
          feed_type?: string
          id?: string
          images?: string[] | null
          is_shadow_hidden?: boolean
          shadow_hidden_at?: string | null
          shadow_hidden_by?: string | null
          updated_at?: string | null
          user_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feed_posts_shadow_hidden_by_fkey"
            columns: ["shadow_hidden_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_shares: {
        Row: {
          body: string | null
          created_at: string | null
          feed_type: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          feed_type: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string | null
          feed_type?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_shares_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_shares_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_cache: {
        Row: {
          cache_key: string
          created_at: string | null
          data: Json
          expires_at: string
          id: string
        }
        Insert: {
          cache_key: string
          created_at?: string | null
          data: Json
          expires_at: string
          id?: string
        }
        Update: {
          cache_key?: string
          created_at?: string | null
          data?: Json
          expires_at?: string
          id?: string
        }
        Relationships: []
      }
      guest_event_notifications: {
        Row: {
          event_id: string | null
          guest_email: string
          id: string
          opened: boolean | null
          sent_at: string | null
        }
        Insert: {
          event_id?: string | null
          guest_email: string
          id?: string
          opened?: boolean | null
          sent_at?: string | null
        }
        Update: {
          event_id?: string | null
          guest_email?: string
          id?: string
          opened?: boolean | null
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_event_notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_pass_events: {
        Row: {
          contact_id: string | null
          created_at: string | null
          event_id: string | null
          guest_pass_code: string
          id: string
          inviter_user_id: string | null
          person_id: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          event_id?: string | null
          guest_pass_code: string
          id?: string
          inviter_user_id?: string | null
          person_id?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          event_id?: string | null
          guest_pass_code?: string
          id?: string
          inviter_user_id?: string | null
          person_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_pass_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_pass_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_pass_events_inviter_user_id_fkey"
            columns: ["inviter_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_pass_events_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
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
      hashtag_mentions: {
        Row: {
          author_handle: string | null
          author_name: string
          comments: number
          content: string
          created_at: string
          id: string
          likes: number
          media_url: string | null
          monitor_id: string
          platform: string
          platform_post_id: string
          posted_at: string
          url: string | null
        }
        Insert: {
          author_handle?: string | null
          author_name: string
          comments?: number
          content: string
          created_at?: string
          id?: string
          likes?: number
          media_url?: string | null
          monitor_id: string
          platform: string
          platform_post_id: string
          posted_at: string
          url?: string | null
        }
        Update: {
          author_handle?: string | null
          author_name?: string
          comments?: number
          content?: string
          created_at?: string
          id?: string
          likes?: number
          media_url?: string | null
          monitor_id?: string
          platform?: string
          platform_post_id?: string
          posted_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hashtag_mentions_monitor_id_fkey"
            columns: ["monitor_id"]
            isOneToOne: false
            referencedRelation: "hashtag_monitors"
            referencedColumns: ["id"]
          },
        ]
      }
      hashtag_monitors: {
        Row: {
          created_at: string
          hashtag: string
          id: string
          is_active: boolean
          last_checked_at: string | null
          platforms: string[]
          total_mentions: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          hashtag: string
          id?: string
          is_active?: boolean
          last_checked_at?: string | null
          platforms?: string[]
          total_mentions?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          hashtag?: string
          id?: string
          is_active?: boolean
          last_checked_at?: string | null
          platforms?: string[]
          total_mentions?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hashtag_monitors_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
      hub_members: {
        Row: {
          added_by: string
          hub_id: string
          id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          added_by: string
          hub_id: string
          id?: string
          joined_at?: string
          user_id: string
        }
        Update: {
          added_by?: string
          hub_id?: string
          id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hub_members_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hub_members_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hub_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hub_post_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          hub_post_id: string
          id: string
          is_edited: boolean
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          hub_post_id: string
          id?: string
          is_edited?: boolean
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          hub_post_id?: string
          id?: string
          is_edited?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "hub_post_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hub_post_comments_hub_post_id_fkey"
            columns: ["hub_post_id"]
            isOneToOne: false
            referencedRelation: "hub_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      hub_post_likes: {
        Row: {
          created_at: string
          hub_post_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hub_post_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          hub_post_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hub_post_likes_hub_post_id_fkey"
            columns: ["hub_post_id"]
            isOneToOne: false
            referencedRelation: "hub_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hub_post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hub_posts: {
        Row: {
          author_id: string
          content: string | null
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          file_names: string[] | null
          file_urls: string[] | null
          hub_id: string
          id: string
          image_urls: string[] | null
          is_edited: boolean
        }
        Insert: {
          author_id: string
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          file_names?: string[] | null
          file_urls?: string[] | null
          hub_id: string
          id?: string
          image_urls?: string[] | null
          is_edited?: boolean
        }
        Update: {
          author_id?: string
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          file_names?: string[] | null
          file_urls?: string[] | null
          hub_id?: string
          id?: string
          image_urls?: string[] | null
          is_edited?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "hub_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hub_posts_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      hub_resources: {
        Row: {
          created_at: string
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          hub_id: string
          id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          hub_id: string
          id?: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          hub_id?: string
          id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "hub_resources_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hub_resources_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hubs: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          header_image_url: string | null
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          header_image_url?: string | null
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          header_image_url?: string | null
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hubs_created_by_fkey"
            columns: ["created_by"]
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
      introductions: {
        Row: {
          approved_at: string | null
          approved_by_person_id: string | null
          context_message: string | null
          created_at: string
          id: string
          metadata: Json | null
          requester_person_id: string
          sent_at: string | null
          source_agent: string | null
          status: string
          target_person_id: string
          target_responded_at: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by_person_id?: string | null
          context_message?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          requester_person_id: string
          sent_at?: string | null
          source_agent?: string | null
          status?: string
          target_person_id: string
          target_responded_at?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by_person_id?: string | null
          context_message?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          requester_person_id?: string
          sent_at?: string | null
          source_agent?: string | null
          status?: string
          target_person_id?: string
          target_responded_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "introductions_approved_by_person_id_fkey"
            columns: ["approved_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "introductions_requester_person_id_fkey"
            columns: ["requester_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "introductions_target_person_id_fkey"
            columns: ["target_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      member_payout_accounts: {
        Row: {
          created_at: string
          profile_id: string
          stripe_account_id: string | null
          stripe_account_status: string
          stripe_onboarding_completed_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          profile_id: string
          stripe_account_id?: string | null
          stripe_account_status?: string
          stripe_onboarding_completed_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          profile_id?: string
          stripe_account_id?: string | null
          stripe_account_status?: string
          stripe_onboarding_completed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_payout_accounts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      member_payouts: {
        Row: {
          amount_cents: number
          created_at: string
          destination_source: string
          failure_reason: string | null
          id: string
          referral_id: string
          referrer_profile_id: string | null
          sent_at: string | null
          status: string
          stripe_transfer_id: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          destination_source: string
          failure_reason?: string | null
          id?: string
          referral_id: string
          referrer_profile_id?: string | null
          sent_at?: string | null
          status?: string
          stripe_transfer_id?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          destination_source?: string
          failure_reason?: string | null
          id?: string
          referral_id?: string
          referrer_profile_id?: string | null
          sent_at?: string | null
          status?: string
          stripe_transfer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_payouts_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_payouts_referrer_profile_id_fkey"
            columns: ["referrer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string | null
          deleted_at: string | null
          edited_at: string | null
          file_names: string[] | null
          file_urls: string[] | null
          id: string
          image_urls: string[] | null
          is_edited: boolean | null
          sender_id: string | null
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string | null
          deleted_at?: string | null
          edited_at?: string | null
          file_names?: string[] | null
          file_urls?: string[] | null
          id?: string
          image_urls?: string[] | null
          is_edited?: boolean | null
          sender_id?: string | null
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string | null
          deleted_at?: string | null
          edited_at?: string | null
          file_names?: string[] | null
          file_urls?: string[] | null
          id?: string
          image_urls?: string[] | null
          is_edited?: boolean | null
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      network_categories: {
        Row: {
          created_at: string
          hub: string
          id: string
          is_active: boolean
          label: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          hub: string
          id?: string
          is_active?: boolean
          label: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          hub?: string
          id?: string
          is_active?: boolean
          label?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      network_click_events: {
        Row: {
          created_at: string
          id: number
          listing_id: string
          referrer: string | null
          source: string | null
          target: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          created_at?: string
          id?: never
          listing_id: string
          referrer?: string | null
          source?: string | null
          target: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          created_at?: string
          id?: never
          listing_id?: string
          referrer?: string | null
          source?: string | null
          target?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "network_click_events_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "network_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      network_leads: {
        Row: {
          created_at: string
          first_replied_at: string | null
          from_profile_id: string | null
          id: string
          landing_path: string | null
          lead_email: string | null
          lead_name: string | null
          lead_phone: string | null
          listing_id: string
          message: string | null
          need: string | null
          source: string | null
          status: string
          status_changed_at: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          created_at?: string
          first_replied_at?: string | null
          from_profile_id?: string | null
          id?: string
          landing_path?: string | null
          lead_email?: string | null
          lead_name?: string | null
          lead_phone?: string | null
          listing_id: string
          message?: string | null
          need?: string | null
          source?: string | null
          status?: string
          status_changed_at?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          created_at?: string
          first_replied_at?: string | null
          from_profile_id?: string | null
          id?: string
          landing_path?: string | null
          lead_email?: string | null
          lead_name?: string | null
          lead_phone?: string | null
          listing_id?: string
          message?: string | null
          need?: string | null
          source?: string | null
          status?: string
          status_changed_at?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "network_leads_from_profile_id_fkey"
            columns: ["from_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_leads_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "network_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      network_listings: {
        Row: {
          billing_status: string | null
          category_id: string
          company_name: string
          created_at: string
          description: string | null
          hard_fail: boolean
          hook: string | null
          hub: string
          id: string
          instagram_url: string | null
          kind: string
          logo_url: string | null
          neighborhood: string | null
          next_review_at: string | null
          owner_profile_id: string | null
          phone: string | null
          photo_urls: string[] | null
          rate_cents: number | null
          rate_locked_until: string | null
          review_score: number | null
          slug: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          verified_at: string | null
          website_url: string | null
        }
        Insert: {
          billing_status?: string | null
          category_id: string
          company_name: string
          created_at?: string
          description?: string | null
          hard_fail?: boolean
          hook?: string | null
          hub: string
          id?: string
          instagram_url?: string | null
          kind: string
          logo_url?: string | null
          neighborhood?: string | null
          next_review_at?: string | null
          owner_profile_id?: string | null
          phone?: string | null
          photo_urls?: string[] | null
          rate_cents?: number | null
          rate_locked_until?: string | null
          review_score?: number | null
          slug: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          verified_at?: string | null
          website_url?: string | null
        }
        Update: {
          billing_status?: string | null
          category_id?: string
          company_name?: string
          created_at?: string
          description?: string | null
          hard_fail?: boolean
          hook?: string | null
          hub?: string
          id?: string
          instagram_url?: string | null
          kind?: string
          logo_url?: string | null
          neighborhood?: string | null
          next_review_at?: string | null
          owner_profile_id?: string | null
          phone?: string | null
          photo_urls?: string[] | null
          rate_cents?: number | null
          rate_locked_until?: string | null
          review_score?: number | null
          slug?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          verified_at?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "network_listings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "network_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_listings_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          conversation_id: string | null
          created_at: string | null
          crm_type: string | null
          event_id: string | null
          id: string
          is_dismissed: boolean | null
          is_read: boolean | null
          message: string
          notification_type: string | null
          priority: string | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          action_url?: string | null
          conversation_id?: string | null
          created_at?: string | null
          crm_type?: string | null
          event_id?: string | null
          id?: string
          is_dismissed?: boolean | null
          is_read?: boolean | null
          message: string
          notification_type?: string | null
          priority?: string | null
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          action_url?: string | null
          conversation_id?: string | null
          created_at?: string | null
          crm_type?: string | null
          event_id?: string | null
          id?: string
          is_dismissed?: boolean | null
          is_read?: boolean | null
          message?: string
          notification_type?: string | null
          priority?: string | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
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
      onboarding_responses: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          member_brief: string | null
          member_brief_generated_at: string | null
          responses: Json
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          member_brief?: string | null
          member_brief_generated_at?: string | null
          responses?: Json
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          member_brief?: string | null
          member_brief_generated_at?: string | null
          responses?: Json
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_responses_user_id_fkey"
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
      partner_applications: {
        Row: {
          applied_at: string
          company_name: string
          denial_reason: string | null
          description: string
          id: string
          invite_id: string | null
          logo_url: string | null
          partner_types: string[]
          phone: string
          photo_urls: string[]
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
          website: string | null
        }
        Insert: {
          applied_at?: string
          company_name: string
          denial_reason?: string | null
          description: string
          id?: string
          invite_id?: string | null
          logo_url?: string | null
          partner_types: string[]
          phone: string
          photo_urls?: string[]
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
          website?: string | null
        }
        Update: {
          applied_at?: string
          company_name?: string
          denial_reason?: string | null
          description?: string
          id?: string
          invite_id?: string | null
          logo_url?: string | null
          partner_types?: string[]
          phone?: string
          photo_urls?: string[]
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_applications_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "partner_invites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_invites: {
        Row: {
          created_at: string
          created_by: string
          email: string | null
          id: string
          revoked: boolean
          revoked_at: string | null
          revoked_by: string | null
          unique_token: string
          used: boolean
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          email?: string | null
          id?: string
          revoked?: boolean
          revoked_at?: string | null
          revoked_by?: string | null
          unique_token: string
          used?: boolean
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          email?: string | null
          id?: string
          revoked?: boolean
          revoked_at?: string | null
          revoked_by?: string | null
          unique_token?: string
          used?: boolean
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_invites_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_invites_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_invoices: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          description: string
          due_date: string | null
          event_id: string | null
          id: string
          partner_id: string
          status: string
          stripe_invoice_id: string | null
          stripe_invoice_url: string | null
          waived_at: string | null
          waived_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          description: string
          due_date?: string | null
          event_id?: string | null
          id?: string
          partner_id: string
          status?: string
          stripe_invoice_id?: string | null
          stripe_invoice_url?: string | null
          waived_at?: string | null
          waived_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          description?: string
          due_date?: string | null
          event_id?: string | null
          id?: string
          partner_id?: string
          status?: string
          stripe_invoice_id?: string | null
          stripe_invoice_url?: string | null
          waived_at?: string | null
          waived_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_invoices_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_invoices_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_invoices_waived_by_fkey"
            columns: ["waived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_listings: {
        Row: {
          company_name: string
          created_at: string
          description: string
          featured_order: number | null
          id: string
          is_featured: boolean
          is_published: boolean
          logo_url: string | null
          partner_types: string[]
          phone: string | null
          photo_urls: string[]
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          company_name: string
          created_at?: string
          description: string
          featured_order?: number | null
          id?: string
          is_featured?: boolean
          is_published?: boolean
          logo_url?: string | null
          partner_types: string[]
          phone?: string | null
          photo_urls?: string[]
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          company_name?: string
          created_at?: string
          description?: string
          featured_order?: number | null
          id?: string
          is_featured?: boolean
          is_published?: boolean
          logo_url?: string | null
          partner_types?: string[]
          phone?: string | null
          photo_urls?: string[]
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_listings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          application_id: string | null
          approved_at: string | null
          business_name: string
          contact_name: string
          created_at: string | null
          email: string
          id: string
          partner_types: string[]
          phone: string | null
          status: string | null
          user_id: string | null
          website: string | null
        }
        Insert: {
          application_id?: string | null
          approved_at?: string | null
          business_name: string
          contact_name: string
          created_at?: string | null
          email: string
          id?: string
          partner_types?: string[]
          phone?: string | null
          status?: string | null
          user_id?: string | null
          website?: string | null
        }
        Update: {
          application_id?: string | null
          approved_at?: string | null
          business_name?: string
          contact_name?: string
          created_at?: string | null
          email?: string
          id?: string
          partner_types?: string[]
          phone?: string | null
          status?: string | null
          user_id?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partners_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
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
      people: {
        Row: {
          auth_user_id: string | null
          canceled_at: string | null
          created_at: string
          email: string
          email_lower: string | null
          full_name: string | null
          id: string
          joined_at: string | null
          last_attended: string | null
          marketing_unsubscribed: boolean
          member_brief: string | null
          member_brief_generated_at: string | null
          member_status: string | null
          member_tier: string | null
          metadata: Json | null
          notes: string | null
          override_paying: boolean | null
          phone: string | null
          phone_e164: string | null
          referred_by_code: string | null
          referred_by_person_id: string | null
          roles: string[]
          sms_consent: boolean | null
          sms_consent_at: string | null
          stripe_customer_id: string | null
          unsubscribed_at: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          canceled_at?: string | null
          created_at?: string
          email: string
          email_lower?: string | null
          full_name?: string | null
          id?: string
          joined_at?: string | null
          last_attended?: string | null
          marketing_unsubscribed?: boolean
          member_brief?: string | null
          member_brief_generated_at?: string | null
          member_status?: string | null
          member_tier?: string | null
          metadata?: Json | null
          notes?: string | null
          override_paying?: boolean | null
          phone?: string | null
          phone_e164?: string | null
          referred_by_code?: string | null
          referred_by_person_id?: string | null
          roles?: string[]
          sms_consent?: boolean | null
          sms_consent_at?: string | null
          stripe_customer_id?: string | null
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          canceled_at?: string | null
          created_at?: string
          email?: string
          email_lower?: string | null
          full_name?: string | null
          id?: string
          joined_at?: string | null
          last_attended?: string | null
          marketing_unsubscribed?: boolean
          member_brief?: string | null
          member_brief_generated_at?: string | null
          member_status?: string | null
          member_tier?: string | null
          metadata?: Json | null
          notes?: string | null
          override_paying?: boolean | null
          phone?: string | null
          phone_e164?: string | null
          referred_by_code?: string | null
          referred_by_person_id?: string | null
          roles?: string[]
          sms_consent?: boolean | null
          sms_consent_at?: string | null
          stripe_customer_id?: string | null
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_referred_by_person_id_fkey"
            columns: ["referred_by_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      person_tags: {
        Row: {
          created_at: string
          person_id: string
          tag: string
        }
        Insert: {
          created_at?: string
          person_id: string
          tag: string
        }
        Update: {
          created_at?: string
          person_id?: string
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_tags_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          is_edited: boolean
          post_id: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_edited?: boolean
          post_id: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_edited?: boolean
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_mentions: {
        Row: {
          comment_id: string | null
          id: string
          mentioned_user_id: string
          post_id: string
        }
        Insert: {
          comment_id?: string | null
          id?: string
          mentioned_user_id: string
          post_id: string
        }
        Update: {
          comment_id?: string | null
          id?: string
          mentioned_user_id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_mentions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_mentions_mentioned_user_id_fkey"
            columns: ["mentioned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_mentions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author_id: string
          content: string | null
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          feed_type: string
          file_names: string[] | null
          file_urls: string[] | null
          id: string
          image_urls: string[] | null
          is_edited: boolean
        }
        Insert: {
          author_id: string
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          feed_type: string
          file_names?: string[] | null
          file_urls?: string[] | null
          id?: string
          image_urls?: string[] | null
          is_edited?: boolean
        }
        Update: {
          author_id?: string
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          feed_type?: string
          file_names?: string[] | null
          file_urls?: string[] | null
          id?: string
          image_urls?: string[] | null
          is_edited?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
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
          account_type: string | null
          admin_notes: string | null
          ambassador_referral_id: string | null
          application_status: string | null
          avatar_url: string | null
          banned: boolean
          banned_at: string | null
          banned_by: string | null
          banned_reason: string | null
          bio: string | null
          calendar_prompt_dismissed_at: string | null
          calendar_subscribed_all_at: string | null
          calendar_subscribed_business_at: string | null
          calendar_subscribed_social_at: string | null
          calendar_token: string
          cancel_at_period_end: boolean | null
          canceled_at: string | null
          comp_reason: string | null
          company: string | null
          created_at: string | null
          deactivated_at: string | null
          deactivation_reason: string | null
          deleted_at: string | null
          email: string
          external_paid_through: string | null
          external_payment_note: string | null
          first_payment_at: string | null
          full_name: string | null
          has_completed_onboarding_rsvp: boolean
          hubspot_contact_id: string | null
          id: string
          imported_at: string | null
          industry: string | null
          is_banned: boolean | null
          is_featured_partner: boolean
          is_founding_member: boolean
          is_internal: boolean
          is_locked_in_pricing: boolean
          is_partner: boolean
          is_sponsor: boolean | null
          is_vendor: boolean | null
          is_venue: boolean | null
          last_attended_at: string | null
          last_seen_at: string | null
          linkedin_url: string | null
          marketing_unsubscribed: boolean | null
          member_since: string | null
          member_type: string | null
          membership_duration: string | null
          membership_override: boolean
          membership_wave: string | null
          notify_announcements: boolean | null
          notify_event_reminders: boolean | null
          notify_new_events: boolean | null
          partner_status: string | null
          partner_type: string | null
          partner_types: string[] | null
          phone: string | null
          referred_by_ambassador_id: string | null
          referred_by_code: string | null
          role: string
          see_all_cross_conversations: boolean
          sms_consent: boolean
          sms_consent_at: string | null
          sms_consent_ip: string | null
          sms_consent_user_agent: string | null
          stripe_customer_id: string | null
          subscription_ends_at: string | null
          subscription_id: string | null
          subscription_paused_until: string | null
          subscription_status: string | null
          tier: string | null
          title: string | null
          updated_at: string | null
          website_url: string | null
        }
        Insert: {
          account_type?: string | null
          admin_notes?: string | null
          ambassador_referral_id?: string | null
          application_status?: string | null
          avatar_url?: string | null
          banned?: boolean
          banned_at?: string | null
          banned_by?: string | null
          banned_reason?: string | null
          bio?: string | null
          calendar_prompt_dismissed_at?: string | null
          calendar_subscribed_all_at?: string | null
          calendar_subscribed_business_at?: string | null
          calendar_subscribed_social_at?: string | null
          calendar_token?: string
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          comp_reason?: string | null
          company?: string | null
          created_at?: string | null
          deactivated_at?: string | null
          deactivation_reason?: string | null
          deleted_at?: string | null
          email: string
          external_paid_through?: string | null
          external_payment_note?: string | null
          first_payment_at?: string | null
          full_name?: string | null
          has_completed_onboarding_rsvp?: boolean
          hubspot_contact_id?: string | null
          id: string
          imported_at?: string | null
          industry?: string | null
          is_banned?: boolean | null
          is_featured_partner?: boolean
          is_founding_member?: boolean
          is_internal?: boolean
          is_locked_in_pricing?: boolean
          is_partner?: boolean
          is_sponsor?: boolean | null
          is_vendor?: boolean | null
          is_venue?: boolean | null
          last_attended_at?: string | null
          last_seen_at?: string | null
          linkedin_url?: string | null
          marketing_unsubscribed?: boolean | null
          member_since?: string | null
          member_type?: string | null
          membership_duration?: string | null
          membership_override?: boolean
          membership_wave?: string | null
          notify_announcements?: boolean | null
          notify_event_reminders?: boolean | null
          notify_new_events?: boolean | null
          partner_status?: string | null
          partner_type?: string | null
          partner_types?: string[] | null
          phone?: string | null
          referred_by_ambassador_id?: string | null
          referred_by_code?: string | null
          role?: string
          see_all_cross_conversations?: boolean
          sms_consent?: boolean
          sms_consent_at?: string | null
          sms_consent_ip?: string | null
          sms_consent_user_agent?: string | null
          stripe_customer_id?: string | null
          subscription_ends_at?: string | null
          subscription_id?: string | null
          subscription_paused_until?: string | null
          subscription_status?: string | null
          tier?: string | null
          title?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Update: {
          account_type?: string | null
          admin_notes?: string | null
          ambassador_referral_id?: string | null
          application_status?: string | null
          avatar_url?: string | null
          banned?: boolean
          banned_at?: string | null
          banned_by?: string | null
          banned_reason?: string | null
          bio?: string | null
          calendar_prompt_dismissed_at?: string | null
          calendar_subscribed_all_at?: string | null
          calendar_subscribed_business_at?: string | null
          calendar_subscribed_social_at?: string | null
          calendar_token?: string
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          comp_reason?: string | null
          company?: string | null
          created_at?: string | null
          deactivated_at?: string | null
          deactivation_reason?: string | null
          deleted_at?: string | null
          email?: string
          external_paid_through?: string | null
          external_payment_note?: string | null
          first_payment_at?: string | null
          full_name?: string | null
          has_completed_onboarding_rsvp?: boolean
          hubspot_contact_id?: string | null
          id?: string
          imported_at?: string | null
          industry?: string | null
          is_banned?: boolean | null
          is_featured_partner?: boolean
          is_founding_member?: boolean
          is_internal?: boolean
          is_locked_in_pricing?: boolean
          is_partner?: boolean
          is_sponsor?: boolean | null
          is_vendor?: boolean | null
          is_venue?: boolean | null
          last_attended_at?: string | null
          last_seen_at?: string | null
          linkedin_url?: string | null
          marketing_unsubscribed?: boolean | null
          member_since?: string | null
          member_type?: string | null
          membership_duration?: string | null
          membership_override?: boolean
          membership_wave?: string | null
          notify_announcements?: boolean | null
          notify_event_reminders?: boolean | null
          notify_new_events?: boolean | null
          partner_status?: string | null
          partner_type?: string | null
          partner_types?: string[] | null
          phone?: string | null
          referred_by_ambassador_id?: string | null
          referred_by_code?: string | null
          role?: string
          see_all_cross_conversations?: boolean
          sms_consent?: boolean
          sms_consent_at?: string | null
          sms_consent_ip?: string | null
          sms_consent_user_agent?: string | null
          stripe_customer_id?: string | null
          subscription_ends_at?: string | null
          subscription_id?: string | null
          subscription_paused_until?: string | null
          subscription_status?: string | null
          tier?: string | null
          title?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_ambassador_referral_id_fkey"
            columns: ["ambassador_referral_id"]
            isOneToOne: false
            referencedRelation: "ambassador_referrals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_banned_by_fkey"
            columns: ["banned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_referred_by_ambassador_id_fkey"
            columns: ["referred_by_ambassador_id"]
            isOneToOne: false
            referencedRelation: "ambassadors"
            referencedColumns: ["id"]
          },
        ]
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
      rate_limits: {
        Row: {
          count: number
          created_at: string
          id: string
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          created_at?: string
          id?: string
          key: string
          window_start?: string
        }
        Update: {
          count?: number
          created_at?: string
          id?: string
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          amount_cents: number
          converted_at: string | null
          created_at: string
          id: string
          payout_notes: string | null
          payout_sent_at: string | null
          payout_status: string
          referred_application_id: string | null
          referred_email: string | null
          referred_name: string | null
          referred_profile_id: string | null
          referrer_email: string | null
          referrer_name: string | null
          referrer_profile_id: string | null
          reward_amount: number | null
          status: string
          stripe_subscription_id: string | null
          stripe_transfer_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          converted_at?: string | null
          created_at?: string
          id?: string
          payout_notes?: string | null
          payout_sent_at?: string | null
          payout_status?: string
          referred_application_id?: string | null
          referred_email?: string | null
          referred_name?: string | null
          referred_profile_id?: string | null
          referrer_email?: string | null
          referrer_name?: string | null
          referrer_profile_id?: string | null
          reward_amount?: number | null
          status?: string
          stripe_subscription_id?: string | null
          stripe_transfer_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          converted_at?: string | null
          created_at?: string
          id?: string
          payout_notes?: string | null
          payout_sent_at?: string | null
          payout_status?: string
          referred_application_id?: string | null
          referred_email?: string | null
          referred_name?: string | null
          referred_profile_id?: string | null
          referrer_email?: string | null
          referrer_name?: string | null
          referrer_profile_id?: string | null
          reward_amount?: number | null
          status?: string
          stripe_subscription_id?: string | null
          stripe_transfer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_application_id_fkey"
            columns: ["referred_application_id"]
            isOneToOne: false
            referencedRelation: "business_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referred_profile_id_fkey"
            columns: ["referred_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_profile_id_fkey"
            columns: ["referrer_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_reply_templates: {
        Row: {
          category: string | null
          content: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
          use_count: number
          workspace_id: string
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
          use_count?: number
          workspace_id: string
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
          use_count?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_reply_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      social_account_metrics: {
        Row: {
          created_at: string
          date: string
          follower_change: number
          follower_count: number
          id: string
          impressions: number
          profile_views: number
          reach: number
          social_account_id: string
          website_clicks: number
        }
        Insert: {
          created_at?: string
          date: string
          follower_change?: number
          follower_count?: number
          id?: string
          impressions?: number
          profile_views?: number
          reach?: number
          social_account_id: string
          website_clicks?: number
        }
        Update: {
          created_at?: string
          date?: string
          follower_change?: number
          follower_count?: number
          id?: string
          impressions?: number
          profile_views?: number
          reach?: number
          social_account_id?: string
          website_clicks?: number
        }
        Relationships: [
          {
            foreignKeyName: "social_account_metrics_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_accounts: {
        Row: {
          access_token: string | null
          account_handle: string | null
          account_id: string
          account_name: string
          account_type: string | null
          avatar_url: string | null
          created_at: string
          follower_count: number
          following_count: number
          id: string
          last_synced_at: string | null
          platform: string
          platform_metadata: Json
          post_count: number
          refresh_token: string | null
          status: string
          sync_error: string | null
          token_expires_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          access_token?: string | null
          account_handle?: string | null
          account_id: string
          account_name: string
          account_type?: string | null
          avatar_url?: string | null
          created_at?: string
          follower_count?: number
          following_count?: number
          id?: string
          last_synced_at?: string | null
          platform: string
          platform_metadata?: Json
          post_count?: number
          refresh_token?: string | null
          status?: string
          sync_error?: string | null
          token_expires_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          access_token?: string | null
          account_handle?: string | null
          account_id?: string
          account_name?: string
          account_type?: string | null
          avatar_url?: string | null
          created_at?: string
          follower_count?: number
          following_count?: number
          id?: string
          last_synced_at?: string | null
          platform?: string
          platform_metadata?: Json
          post_count?: number
          refresh_token?: string | null
          status?: string
          sync_error?: string | null
          token_expires_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      social_inbox_messages: {
        Row: {
          assigned_to: string | null
          author_avatar_url: string | null
          author_handle: string | null
          author_name: string
          author_platform_id: string | null
          contact_id: string | null
          content: string
          created_at: string
          direction: string
          id: string
          labels: string[]
          media_url: string | null
          parent_message_id: string | null
          platform_message_id: string
          platform_post_id: string | null
          received_at: string
          replied_at: string | null
          sentiment: string | null
          social_account_id: string
          status: string
          type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assigned_to?: string | null
          author_avatar_url?: string | null
          author_handle?: string | null
          author_name: string
          author_platform_id?: string | null
          contact_id?: string | null
          content: string
          created_at?: string
          direction?: string
          id?: string
          labels?: string[]
          media_url?: string | null
          parent_message_id?: string | null
          platform_message_id: string
          platform_post_id?: string | null
          received_at: string
          replied_at?: string | null
          sentiment?: string | null
          social_account_id: string
          status?: string
          type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assigned_to?: string | null
          author_avatar_url?: string | null
          author_handle?: string | null
          author_name?: string
          author_platform_id?: string | null
          contact_id?: string | null
          content?: string
          created_at?: string
          direction?: string
          id?: string
          labels?: string[]
          media_url?: string | null
          parent_message_id?: string | null
          platform_message_id?: string
          platform_post_id?: string | null
          received_at?: string
          replied_at?: string | null
          sentiment?: string | null
          social_account_id?: string
          status?: string
          type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_inbox_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_inbox_messages_parent_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "social_inbox_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_inbox_messages_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_inbox_messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      social_inbox_replies: {
        Row: {
          content: string
          created_at: string
          id: string
          message_id: string
          platform_reply_id: string | null
          sent_at: string
          sent_by: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          message_id: string
          platform_reply_id?: string | null
          sent_at?: string
          sent_by: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          message_id?: string
          platform_reply_id?: string | null
          sent_at?: string
          sent_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_inbox_replies_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "social_inbox_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      social_post_metrics: {
        Row: {
          clicks: number
          comments: number
          created_at: string
          engagement_rate: number
          id: string
          impressions: number
          last_synced_at: string | null
          likes: number
          platform_post_id: string
          post_id: string
          reach: number
          saves: number
          shares: number
          social_account_id: string
          updated_at: string
          video_completion_rate: number
          video_views: number
        }
        Insert: {
          clicks?: number
          comments?: number
          created_at?: string
          engagement_rate?: number
          id?: string
          impressions?: number
          last_synced_at?: string | null
          likes?: number
          platform_post_id: string
          post_id: string
          reach?: number
          saves?: number
          shares?: number
          social_account_id: string
          updated_at?: string
          video_completion_rate?: number
          video_views?: number
        }
        Update: {
          clicks?: number
          comments?: number
          created_at?: string
          engagement_rate?: number
          id?: string
          impressions?: number
          last_synced_at?: string | null
          likes?: number
          platform_post_id?: string
          post_id?: string
          reach?: number
          saves?: number
          shares?: number
          social_account_id?: string
          updated_at?: string
          video_completion_rate?: number
          video_views?: number
        }
        Relationships: [
          {
            foreignKeyName: "social_post_metrics_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_post_metrics_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      social_posts: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          campaign_id: string | null
          caption: string
          created_at: string
          created_by: string | null
          first_comment: string | null
          hashtags: string[]
          id: string
          is_recurring: boolean
          link_url: string | null
          media_types: string[]
          media_urls: string[]
          mentions: string[]
          parent_post_id: string | null
          platform_post_ids: Json
          published_at: string | null
          recurrence_rule: string | null
          rejection_reason: string | null
          scheduled_at: string | null
          status: string
          target_account_ids: string[]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          campaign_id?: string | null
          caption: string
          created_at?: string
          created_by?: string | null
          first_comment?: string | null
          hashtags?: string[]
          id?: string
          is_recurring?: boolean
          link_url?: string | null
          media_types?: string[]
          media_urls?: string[]
          mentions?: string[]
          parent_post_id?: string | null
          platform_post_ids?: Json
          published_at?: string | null
          recurrence_rule?: string | null
          rejection_reason?: string | null
          scheduled_at?: string | null
          status?: string
          target_account_ids?: string[]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          campaign_id?: string | null
          caption?: string
          created_at?: string
          created_by?: string | null
          first_comment?: string | null
          hashtags?: string[]
          id?: string
          is_recurring?: boolean
          link_url?: string | null
          media_types?: string[]
          media_urls?: string[]
          mentions?: string[]
          parent_post_id?: string | null
          platform_post_ids?: Json
          published_at?: string | null
          recurrence_rule?: string | null
          rejection_reason?: string | null
          scheduled_at?: string | null
          status?: string
          target_account_ids?: string[]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_parent_fkey"
            columns: ["parent_post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_posts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
          amount_paid_cents: number | null
          cancellation_reason: string | null
          cancelled_at: string | null
          checked_in_at: string | null
          checked_in_by: string | null
          created_at: string | null
          event_id: string | null
          guest_email: string | null
          guest_name: string | null
          id: string
          metadata: Json | null
          source: string | null
          status: string | null
          stripe_payment_id: string | null
          ticket_type: string
          user_id: string | null
        }
        Insert: {
          amount_paid_cents?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          created_at?: string | null
          event_id?: string | null
          guest_email?: string | null
          guest_name?: string | null
          id?: string
          metadata?: Json | null
          source?: string | null
          status?: string | null
          stripe_payment_id?: string | null
          ticket_type: string
          user_id?: string | null
        }
        Update: {
          amount_paid_cents?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          created_at?: string | null
          event_id?: string | null
          guest_email?: string | null
          guest_name?: string | null
          id?: string
          metadata?: Json | null
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
      utm_tracking: {
        Row: {
          contact_id: string | null
          conversion_type: string | null
          converted: boolean | null
          converted_at: string | null
          created_at: string | null
          id: string
          page_url: string | null
          profile_id: string | null
          referrer: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          contact_id?: string | null
          conversion_type?: string | null
          converted?: boolean | null
          converted_at?: string | null
          created_at?: string | null
          id?: string
          page_url?: string | null
          profile_id?: string | null
          referrer?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          contact_id?: string | null
          conversion_type?: string | null
          converted?: boolean | null
          converted_at?: string | null
          created_at?: string | null
          id?: string
          page_url?: string | null
          profile_id?: string | null
          referrer?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "utm_tracking_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "utm_tracking_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      event_participants_view: {
        Row: {
          checked_in_at: string | null
          checked_in_by: string | null
          contact_id: string | null
          created_at: string | null
          email: string | null
          event_id: string | null
          full_name: string | null
          guest_name: string | null
          id: string | null
          participant_source: string | null
          public_rsvp_id: string | null
          sms_consent: boolean | null
          status: string | null
          stripe_payment_id: string | null
          ticket_type: string | null
          user_id: string | null
        }
        Relationships: []
      }
      identity_bridge_health: {
        Row: {
          bridged_ok: number | null
          member_profiles_total: number | null
          members_bridged_by_auth_column: number | null
          members_missing_people_row: number | null
          members_with_unbridged_people_row_by_email: number | null
          people_backfill_gap: number | null
          people_column_metadata_mismatch: number | null
          people_pointing_at_dead_profile: number | null
        }
        Relationships: []
      }
      member_counts: {
        Row: {
          active_members: number | null
          coupon_comped: number | null
          override_comped: number | null
          paying_members: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_view_event_discussion: {
        Args: { p_event_id: string }
        Returns: boolean
      }
      contact_source_is_door: { Args: { p_source: string }; Returns: boolean }
      get_ambassador_by_code: {
        Args: { p_code: string }
        Returns: {
          full_name: string
          id: string
          is_active: boolean
        }[]
      }
      get_ambassador_leaderboard: {
        Args: never
        Returns: {
          full_name: string
          id: string
          referral_code: string
          total_earned_cents: number
          total_referrals: number
        }[]
      }
      get_business_card_public: {
        Args: { pid: string }
        Returns: {
          avatar_url: string | null
          company: string | null
          created_at: string
          custom_fields: Json | null
          email: string | null
          full_name: string | null
          id: string
          linkedin_url: string | null
          phone: string | null
          public_id: string
          title: string | null
          updated_at: string
          user_id: string
          website_url: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "business_cards"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_community_stats: { Args: never; Returns: Json }
      get_event_attendance_count: {
        Args: { p_event_id: string }
        Returns: number
      }
      get_event_attendance_counts: {
        Args: { p_event_ids: string[] }
        Returns: {
          count: number
          event_id: string
        }[]
      }
      get_event_attendees: { Args: { p_event_id: string }; Returns: Json }
      get_event_discussion_mentionable_ids: {
        Args: { p_event_id: string }
        Returns: {
          full_name: string
          id: string
        }[]
      }
      get_member_counts: {
        Args: never
        Returns: {
          active_members: number
          coupon_comped: number
          override_comped: number
          paying_members: number
        }[]
      }
      get_monthly_ambassador_leaderboard: {
        Args: never
        Returns: {
          ambassador_id: string
          full_name: string
          monthly_conversions: number
          rank: number
          referral_code: string
        }[]
      }
      get_my_events: { Args: never; Returns: Json[] }
      get_ticket_counts: {
        Args: { event_ids: string[] }
        Returns: {
          count: number
          event_id: string
        }[]
      }
      has_role:
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
        | { Args: { role_name: string; user_uuid: string }; Returns: boolean }
      is_active_member: { Args: { p_user_id: string }; Returns: boolean }
      is_active_user: { Args: { _user_id: string }; Returns: boolean }
      is_admin_conversation_participant: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      is_conversation_member: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      is_event_discussion_moderator: { Args: never; Returns: boolean }
      is_hub_member: { Args: { p_hub_id: string }; Returns: boolean }
      search_event_discussion_mentionables: {
        Args: { p_event_id: string; p_query: string }
        Returns: {
          avatar_url: string
          full_name: string
          id: string
        }[]
      }
      set_marketing_optout: {
        Args: { p_email: string; p_source?: string; p_unsubscribe: boolean }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      storage_hub_path_valid: { Args: { path: string }; Returns: boolean }
      storage_is_admin: { Args: never; Returns: boolean }
      storage_is_hub_member_for_path: {
        Args: { path: string }
        Returns: boolean
      }
      storage_is_portal_member: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "member" | "super_admin"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "member", "super_admin"],
    },
  },
} as const
