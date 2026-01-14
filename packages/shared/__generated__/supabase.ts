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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      characters: {
        Row: {
          created_at: string
          id: string
          name: string
          novel_id: string
          profile: Json
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          novel_id: string
          profile?: Json
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          novel_id?: string
          profile?: Json
        }
        Relationships: [
          {
            foreignKeyName: "characters_novel_id_fkey1"
            columns: ["novel_id"]
            isOneToOne: false
            referencedRelation: "novels"
            referencedColumns: ["id"]
          },
        ]
      }
      episodes: {
        Row: {
          content: string
          created_at: string
          episode_no: number
          id: string
          novel_id: string
        }
        Insert: {
          content: string
          created_at?: string
          episode_no: number
          id?: string
          novel_id: string
        }
        Update: {
          content?: string
          created_at?: string
          episode_no?: number
          id?: string
          novel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "episodes_novel_id_fkey1"
            columns: ["novel_id"]
            isOneToOne: false
            referencedRelation: "novels"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          created_at: string
          id: string
          name: string
          novel_id: string
          profile: Json
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          novel_id: string
          profile?: Json
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          novel_id?: string
          profile?: Json
        }
        Relationships: [
          {
            foreignKeyName: "locations_novel_id_fkey"
            columns: ["novel_id"]
            isOneToOne: false
            referencedRelation: "novels"
            referencedColumns: ["id"]
          },
        ]
      }
      novels: {
        Row: {
          created_at: string
          genre: string
          id: string
          status: string
          title: string
        }
        Insert: {
          created_at?: string
          genre: string
          id?: string
          status?: string
          title: string
        }
        Update: {
          created_at?: string
          genre?: string
          id?: string
          status?: string
          title?: string
        }
        Relationships: []
      }
      plot_seed_characters: {
        Row: {
          character_id: string
          created_at: string
          plot_seed_id: string
        }
        Insert: {
          character_id: string
          created_at?: string
          plot_seed_id: string
        }
        Update: {
          character_id?: string
          created_at?: string
          plot_seed_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plot_seed_characters_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plot_seed_characters_plot_seed_id_fkey"
            columns: ["plot_seed_id"]
            isOneToOne: false
            referencedRelation: "plot_seeds"
            referencedColumns: ["id"]
          },
        ]
      }
      plot_seed_locations: {
        Row: {
          created_at: string
          location_id: string
          plot_seed_id: string
        }
        Insert: {
          created_at?: string
          location_id: string
          plot_seed_id: string
        }
        Update: {
          created_at?: string
          location_id?: string
          plot_seed_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plot_seed_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plot_seed_locations_plot_seed_id_fkey"
            columns: ["plot_seed_id"]
            isOneToOne: false
            referencedRelation: "plot_seeds"
            referencedColumns: ["id"]
          },
        ]
      }
      plot_seeds: {
        Row: {
          created_at: string
          detail: string
          id: string
          introduced_in_episode_id: string | null
          novel_id: string
          resolved_in_episode_id: string | null
          status: string
          title: string
        }
        Insert: {
          created_at?: string
          detail: string
          id?: string
          introduced_in_episode_id?: string | null
          novel_id: string
          resolved_in_episode_id?: string | null
          status?: string
          title: string
        }
        Update: {
          created_at?: string
          detail?: string
          id?: string
          introduced_in_episode_id?: string | null
          novel_id?: string
          resolved_in_episode_id?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "plot_seeds_introduced_in_episode_id_fkey"
            columns: ["introduced_in_episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plot_seeds_novel_id_fkey"
            columns: ["novel_id"]
            isOneToOne: false
            referencedRelation: "novels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plot_seeds_resolved_in_episode_id_fkey"
            columns: ["resolved_in_episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      story_contexts: {
        Row: {
          context: Json
          created_at: string
          id: string
          novel_id: string
        }
        Insert: {
          context: Json
          created_at?: string
          id?: string
          novel_id: string
        }
        Update: {
          context?: Json
          created_at?: string
          id?: string
          novel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_contexts_novel_id_fkey"
            columns: ["novel_id"]
            isOneToOne: false
            referencedRelation: "novels"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acquire_lock: {
        Args: { name: string; owner: string; ttl_ms?: number }
        Returns: boolean
      }
      extend_lock: {
        Args: { name: string; owner: string; ttl_ms?: number }
        Returns: boolean
      }
      release_lock: { Args: { name: string; owner: string }; Returns: boolean }
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
