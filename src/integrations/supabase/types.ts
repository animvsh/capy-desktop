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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          conversation_id: string | null
          created_at: string
          description: string | null
          id: string
          lead_id: string | null
          metadata: Json | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      approved_users: {
        Row: {
          approved_at: string
          email: string
          id: string
          notes: string | null
        }
        Insert: {
          approved_at?: string
          email: string
          id?: string
          notes?: string | null
        }
        Update: {
          approved_at?: string
          email?: string
          id?: string
          notes?: string | null
        }
        Relationships: []
      }
      auto_run_jobs: {
        Row: {
          created_at: string | null
          current_step: string | null
          error: string | null
          icp_data: Json | null
          id: string
          prospects: Json | null
          sent_results: Json | null
          status: string | null
          steps: Json | null
          test_email: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          current_step?: string | null
          error?: string | null
          icp_data?: Json | null
          id?: string
          prospects?: Json | null
          sent_results?: Json | null
          status?: string | null
          steps?: Json | null
          test_email: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          current_step?: string | null
          error?: string | null
          icp_data?: Json | null
          id?: string
          prospects?: Json | null
          sent_results?: Json | null
          status?: string | null
          steps?: Json | null
          test_email?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      blacklist: {
        Row: {
          company_name: string | null
          created_at: string | null
          domain: string | null
          id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string | null
          domain?: string | null
          id?: string
          reason?: string | null
          user_id: string
        }
        Update: {
          company_name?: string | null
          created_at?: string | null
          domain?: string | null
          id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          company_size_label: string | null
          company_size_max: number | null
          company_size_min: number | null
          created_at: string | null
          description: string | null
          domain: string | null
          enriched_at: string | null
          external_id: string | null
          funding_stage: string | null
          id: string
          industry: string | null
          linkedin_url: string | null
          location: string | null
          name: string
          revenue_range: string | null
          source: string | null
          tech_stack: string[] | null
          updated_at: string | null
          user_id: string
          website: string | null
        }
        Insert: {
          company_size_label?: string | null
          company_size_max?: number | null
          company_size_min?: number | null
          created_at?: string | null
          description?: string | null
          domain?: string | null
          enriched_at?: string | null
          external_id?: string | null
          funding_stage?: string | null
          id?: string
          industry?: string | null
          linkedin_url?: string | null
          location?: string | null
          name: string
          revenue_range?: string | null
          source?: string | null
          tech_stack?: string[] | null
          updated_at?: string | null
          user_id: string
          website?: string | null
        }
        Update: {
          company_size_label?: string | null
          company_size_max?: number | null
          company_size_min?: number | null
          created_at?: string | null
          description?: string | null
          domain?: string | null
          enriched_at?: string | null
          external_id?: string | null
          funding_stage?: string | null
          id?: string
          industry?: string | null
          linkedin_url?: string | null
          location?: string | null
          name?: string
          revenue_range?: string | null
          source?: string | null
          tech_stack?: string[] | null
          updated_at?: string | null
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      conversations: {
        Row: {
          capy_enabled: boolean | null
          created_at: string | null
          id: string
          last_message_at: string | null
          lead_id: string
          message_count: number | null
          recipient_email: string | null
          status: string | null
          thread_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          capy_enabled?: boolean | null
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          lead_id: string
          message_count?: number | null
          recipient_email?: string | null
          status?: string | null
          thread_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          capy_enabled?: boolean | null
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          lead_id?: string
          message_count?: number | null
          recipient_email?: string | null
          status?: string | null
          thread_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      icp_profiles: {
        Row: {
          created_at: string | null
          id: string
          ideal_customer: string | null
          problem_solved: string | null
          success_definition: string | null
          tone: number | null
          updated_at: string | null
          user_id: string
          what_you_sell: string | null
          who_is_it_for: string | null
          who_to_avoid: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          ideal_customer?: string | null
          problem_solved?: string | null
          success_definition?: string | null
          tone?: number | null
          updated_at?: string | null
          user_id: string
          what_you_sell?: string | null
          who_is_it_for?: string | null
          who_to_avoid?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          ideal_customer?: string | null
          problem_solved?: string | null
          success_definition?: string | null
          tone?: number | null
          updated_at?: string | null
          user_id?: string
          what_you_sell?: string | null
          who_is_it_for?: string | null
          who_to_avoid?: string | null
        }
        Relationships: []
      }
      contacted_contacts: {
        Row: {
          id: string
          user_id: string
          email: string | null
          linkedin_url: string | null
          apollo_id: string | null
          clado_id: string | null
          name: string | null
          company: string | null
          source: string
          lead_id: string | null
          first_discovered_at: string | null
          first_contacted_at: string | null
          contact_count: number | null
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          email?: string | null
          linkedin_url?: string | null
          apollo_id?: string | null
          clado_id?: string | null
          name?: string | null
          company?: string | null
          source: string
          lead_id?: string | null
          first_discovered_at?: string | null
          first_contacted_at?: string | null
          contact_count?: number | null
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          email?: string | null
          linkedin_url?: string | null
          apollo_id?: string | null
          clado_id?: string | null
          name?: string | null
          company?: string | null
          source?: string
          lead_id?: string | null
          first_discovered_at?: string | null
          first_contacted_at?: string | null
          contact_count?: number | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacted_contacts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      linkedin_leads: {
        Row: {
          id: string
          user_id: string
          name: string
          title: string | null
          company: string | null
          linkedin_url: string | null
          headline: string | null
          location: string | null
          status: string
          generated_message: string | null
          generated_title: string | null
          source: string
          email: string | null
          conversation_id: string | null
          created_at: string
          reached_out_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          title?: string | null
          company?: string | null
          linkedin_url?: string | null
          headline?: string | null
          location?: string | null
          status?: string
          generated_message?: string | null
          generated_title?: string | null
          source?: string
          email?: string | null
          conversation_id?: string | null
          created_at?: string
          reached_out_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          title?: string | null
          company?: string | null
          linkedin_url?: string | null
          headline?: string | null
          location?: string | null
          status?: string
          generated_message?: string | null
          generated_title?: string | null
          source?: string
          email?: string | null
          conversation_id?: string | null
          created_at?: string
          reached_out_at?: string | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          apollo_id: string | null
          approved_at: string | null
          approved_by: string | null
          clado_id: string | null
          company: string | null
          created_at: string | null
          email: string
          email_confidence: number | null
          enrichment_attempts: Json | null
          icp_score: number | null
          id: string
          linkedin_url: string | null
          name: string
          source: string | null
          status: string | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          apollo_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          clado_id?: string | null
          company?: string | null
          created_at?: string | null
          email: string
          email_confidence?: number | null
          enrichment_attempts?: Json | null
          icp_score?: number | null
          id?: string
          linkedin_url?: string | null
          name: string
          source?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          apollo_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          clado_id?: string | null
          company?: string | null
          created_at?: string | null
          email?: string
          email_confidence?: number | null
          enrichment_attempts?: Json | null
          icp_score?: number | null
          id?: string
          linkedin_url?: string | null
          name?: string
          source?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          company_id: string | null
          company_size_fit: number | null
          created_at: string | null
          id: string
          industry_match: number | null
          lead_id: string | null
          product_profile_id: string | null
          reasoning: Json | null
          role_match: number | null
          score: number | null
          seniority_score: number | null
          status: string | null
          tech_stack_match: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          company_id?: string | null
          company_size_fit?: number | null
          created_at?: string | null
          id?: string
          industry_match?: number | null
          lead_id?: string | null
          product_profile_id?: string | null
          reasoning?: Json | null
          role_match?: number | null
          score?: number | null
          seniority_score?: number | null
          status?: string | null
          tech_stack_match?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          company_id?: string | null
          company_size_fit?: number | null
          created_at?: string | null
          id?: string
          industry_match?: number | null
          lead_id?: string | null
          product_profile_id?: string | null
          reasoning?: Json | null
          role_match?: number | null
          score?: number | null
          seniority_score?: number | null
          status?: string | null
          tech_stack_match?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_product_profile_id_fkey"
            columns: ["product_profile_id"]
            isOneToOne: false
            referencedRelation: "product_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_proposals: {
        Row: {
          approved_at: string | null
          booked_at: string | null
          conversation_id: string | null
          created_at: string | null
          email_draft: string | null
          id: string
          lead_id: string
          proposed_times: Json | null
          sent_at: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          booked_at?: string | null
          conversation_id?: string | null
          created_at?: string | null
          email_draft?: string | null
          id?: string
          lead_id: string
          proposed_times?: Json | null
          sent_at?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          approved_at?: string | null
          booked_at?: string | null
          conversation_id?: string | null
          created_at?: string | null
          email_draft?: string | null
          id?: string
          lead_id?: string
          proposed_times?: Json | null
          sent_at?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_proposals_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_proposals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          conversation_id: string | null
          created_at: string | null
          duration_minutes: number | null
          id: string
          lead_id: string
          meeting_link: string | null
          notes: string | null
          scheduled_at: string
          status: string | null
          user_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          lead_id: string
          meeting_link?: string | null
          notes?: string | null
          scheduled_at: string
          status?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string | null
          duration_minutes?: number | null
          id?: string
          lead_id?: string
          meeting_link?: string | null
          notes?: string | null
          scheduled_at?: string
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          ai_intent: string | null
          content: string
          conversation_id: string
          direction: string
          external_id: string | null
          id: string
          open_count: number | null
          opened_at: string | null
          pending_review: boolean | null
          sent_at: string | null
        }
        Insert: {
          ai_intent?: string | null
          content: string
          conversation_id: string
          direction: string
          external_id?: string | null
          id?: string
          open_count?: number | null
          opened_at?: string | null
          pending_review?: boolean | null
          sent_at?: string | null
        }
        Update: {
          ai_intent?: string | null
          content?: string
          conversation_id?: string
          direction?: string
          external_id?: string | null
          id?: string
          open_count?: number | null
          opened_at?: string | null
          pending_review?: boolean | null
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_profiles: {
        Row: {
          avoid_phrases: string[] | null
          confirmed_at: string | null
          core_problem: string | null
          core_solution: string | null
          created_at: string | null
          id: string
          not_for: string | null
          one_liner: string
          raw_content: Json | null
          safe_phrases: string[] | null
          target_customer: string | null
          tone: string | null
          updated_at: string | null
          url: string | null
          user_id: string
        }
        Insert: {
          avoid_phrases?: string[] | null
          confirmed_at?: string | null
          core_problem?: string | null
          core_solution?: string | null
          created_at?: string | null
          id?: string
          not_for?: string | null
          one_liner: string
          raw_content?: Json | null
          safe_phrases?: string[] | null
          target_customer?: string | null
          tone?: string | null
          updated_at?: string | null
          url?: string | null
          user_id: string
        }
        Update: {
          avoid_phrases?: string[] | null
          confirmed_at?: string | null
          core_problem?: string | null
          core_solution?: string | null
          created_at?: string | null
          id?: string
          not_for?: string | null
          one_liner?: string
          raw_content?: Json | null
          safe_phrases?: string[] | null
          target_customer?: string | null
          tone?: string | null
          updated_at?: string | null
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company_name: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          onboarded: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          onboarded?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          company_name?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          onboarded?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      targeting_signals: {
        Row: {
          company_size_max: number | null
          company_size_min: number | null
          created_at: string | null
          departments: string[] | null
          id: string
          industries: string[] | null
          keywords: string[] | null
          product_profile_id: string | null
          roles: string[] | null
          tech_stack_signals: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          company_size_max?: number | null
          company_size_min?: number | null
          created_at?: string | null
          departments?: string[] | null
          id?: string
          industries?: string[] | null
          keywords?: string[] | null
          product_profile_id?: string | null
          roles?: string[] | null
          tech_stack_signals?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          company_size_max?: number | null
          company_size_min?: number | null
          created_at?: string | null
          departments?: string[] | null
          id?: string
          industries?: string[] | null
          keywords?: string[] | null
          product_profile_id?: string | null
          roles?: string[] | null
          tech_stack_signals?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "targeting_signals_product_profile_id_fkey"
            columns: ["product_profile_id"]
            isOneToOne: false
            referencedRelation: "product_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          account_created_at: string | null
          admin_credit_adjustment: number | null
          auto_cooldown: boolean | null
          brok_active: boolean | null
          cached_credits: number | null
          calendar_connected: boolean | null
          created_at: string | null
          credits_last_calculated: string | null
          daily_send_limit: number | null
          email_connected: boolean | null
          email_trigger_enabled: boolean | null
          id: string
          last_inbox_check: string | null
          meet_connected: boolean | null
          pause_on_weekends: boolean | null
          purchased_credits: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_created_at?: string | null
          admin_credit_adjustment?: number | null
          auto_cooldown?: boolean | null
          brok_active?: boolean | null
          cached_credits?: number | null
          calendar_connected?: boolean | null
          created_at?: string | null
          credits_last_calculated?: string | null
          daily_send_limit?: number | null
          email_connected?: boolean | null
          email_trigger_enabled?: boolean | null
          id?: string
          last_inbox_check?: string | null
          meet_connected?: boolean | null
          pause_on_weekends?: boolean | null
          purchased_credits?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_created_at?: string | null
          admin_credit_adjustment?: number | null
          auto_cooldown?: boolean | null
          brok_active?: boolean | null
          cached_credits?: number | null
          calendar_connected?: boolean | null
          created_at?: string | null
          credits_last_calculated?: string | null
          daily_send_limit?: number | null
          email_connected?: boolean | null
          email_trigger_enabled?: boolean | null
          id?: string
          last_inbox_check?: string | null
          meet_connected?: boolean | null
          pause_on_weekends?: boolean | null
          purchased_credits?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_integrations: {
        Row: {
          id: string
          user_id: string
          apollo_enabled: boolean
          capyweb_enabled: boolean
          perplexity_enabled: boolean
          sonar_enabled: boolean
          apollo_api_key: string | null
          perplexity_api_key: string | null
          sonar_api_key: string | null
          apollo_connected: boolean
          perplexity_connected: boolean
          sonar_connected: boolean
          capyweb_connected: boolean
          apollo_last_sync: string | null
          perplexity_last_sync: string | null
          sonar_last_sync: string | null
          apollo_daily_limit: number
          apollo_daily_used: number
          perplexity_daily_limit: number
          perplexity_daily_used: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          apollo_enabled?: boolean
          capyweb_enabled?: boolean
          perplexity_enabled?: boolean
          sonar_enabled?: boolean
          apollo_api_key?: string | null
          perplexity_api_key?: string | null
          sonar_api_key?: string | null
          apollo_connected?: boolean
          perplexity_connected?: boolean
          sonar_connected?: boolean
          capyweb_connected?: boolean
          apollo_last_sync?: string | null
          perplexity_last_sync?: string | null
          sonar_last_sync?: string | null
          apollo_daily_limit?: number
          apollo_daily_used?: number
          perplexity_daily_limit?: number
          perplexity_daily_used?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          apollo_enabled?: boolean
          capyweb_enabled?: boolean
          perplexity_enabled?: boolean
          sonar_enabled?: boolean
          apollo_api_key?: string | null
          perplexity_api_key?: string | null
          sonar_api_key?: string | null
          apollo_connected?: boolean
          perplexity_connected?: boolean
          sonar_connected?: boolean
          capyweb_connected?: boolean
          apollo_last_sync?: string | null
          perplexity_last_sync?: string | null
          sonar_last_sync?: string | null
          apollo_daily_limit?: number
          apollo_daily_used?: number
          perplexity_daily_limit?: number
          perplexity_daily_used?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      api_cost_tracking: {
        Row: {
          id: string
          user_id: string
          job_id: string | null
          function_name: string
          action: string
          service: string
          cost_dollars: number
          credits_used: number
          quantity: number
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          job_id?: string | null
          function_name: string
          action: string
          service: string
          cost_dollars?: number
          credits_used?: number
          quantity?: number
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          job_id?: string | null
          function_name?: string
          action?: string
          service?: string
          cost_dollars?: number
          credits_used?: number
          quantity?: number
          metadata?: Json
          created_at?: string
        }
        Relationships: []
      }
      scheduling_links: {
        Row: {
          id: string
          user_id: string
          slug: string
          title: string
          description: string | null
          duration: number
          availability: Json
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          slug: string
          title: string
          description?: string | null
          duration?: number
          availability?: Json
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          slug?: string
          title?: string
          description?: string | null
          duration?: number
          availability?: Json
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          id: string
          scheduling_link_id: string
          host_user_id: string
          guest_name: string
          guest_email: string
          start_time: string
          end_time: string
          calendar_event_id: string | null
          meet_link: string | null
          status: string
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          scheduling_link_id: string
          host_user_id: string
          guest_name: string
          guest_email: string
          start_time: string
          end_time: string
          calendar_event_id?: string | null
          meet_link?: string | null
          status?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          scheduling_link_id?: string
          host_user_id?: string
          guest_name?: string
          guest_email?: string
          start_time?: string
          end_time?: string
          calendar_event_id?: string | null
          meet_link?: string | null
          status?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_scheduling_link_id_fkey"
            columns: ["scheduling_link_id"]
            isOneToOne: false
            referencedRelation: "scheduling_links"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      increment_conversation_message_count: {
        Args: { conv_id: string }
        Returns: undefined
      }
      increment_open_count: {
        Args: { message_uuid: string }
        Returns: undefined
      }
      is_user_approved: { Args: { user_email: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

