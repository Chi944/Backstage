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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      commands: {
        Row: {
          created_at: string | null
          created_by: string
          description: string
          embedding: string | null
          example_phrase: string
          id: number
          name: string
          param_type: string
          rpc_name: string
          sql_preview: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string
          description: string
          embedding?: string | null
          example_phrase: string
          id?: never
          name: string
          param_type?: string
          rpc_name: string
          sql_preview: string
        }
        Update: {
          created_at?: string | null
          created_by?: string
          description?: string
          embedding?: string | null
          example_phrase?: string
          id?: never
          name?: string
          param_type?: string
          rpc_name?: string
          sql_preview?: string
        }
        Relationships: []
      }
      guests: {
        Row: {
          checked_in_at: string | null
          created_at: string | null
          id: number
          name: string
          table_no: number | null
          tier: string
        }
        Insert: {
          checked_in_at?: string | null
          created_at?: string | null
          id?: never
          name: string
          table_no?: number | null
          tier?: string
        }
        Update: {
          checked_in_at?: string | null
          created_at?: string | null
          id?: never
          name?: string
          table_no?: number | null
          tier?: string
        }
        Relationships: []
      }
      history: {
        Row: {
          action: string | null
          changed_at: string | null
          guest_id: number | null
          id: number
          old_data: Json
          tx_id: number
          undone: boolean | null
        }
        Insert: {
          action?: string | null
          changed_at?: string | null
          guest_id?: number | null
          id?: never
          old_data: Json
          tx_id?: number
          undone?: boolean | null
        }
        Update: {
          action?: string | null
          changed_at?: string | null
          guest_id?: number | null
          id?: never
          old_data?: Json
          tx_id?: number
          undone?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "history_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
        ]
      }
      unknown_requests: {
        Row: {
          created_at: string | null
          id: number
          resolved: boolean | null
          text: string
        }
        Insert: {
          created_at?: string | null
          id?: never
          resolved?: boolean | null
          text: string
        }
        Update: {
          created_at?: string | null
          id?: never
          resolved?: boolean | null
          text?: string
        }
        Relationships: []
      }
    }
    Views: {
      command_catalog: {
        Row: {
          created_by: string | null
          description: string | null
          name: string | null
          param_type: string | null
          rpc_name: string | null
          sql_preview: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      check_in_guest: { Args: { p_guest_id: number }; Returns: Json }
      check_out_guest: { Args: { p_guest_id: number }; Returns: Json }
      guess_guest: {
        Args: { p_text: string }
        Returns: {
          id: number
          name: string
          score: number
        }[]
      }
      guests_at_table: { Args: { p_table: number }; Returns: Json }
      log_unknown: { Args: { p_text: string }; Returns: number }
      match_command: {
        Args: {
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          description: string
          example_phrase: string
          id: number
          name: string
          param_type: string
          rpc_name: string
          similarity: number
          sql_preview: string
        }[]
      }
      move_table: { Args: { p_from: number; p_to: number }; Returns: Json }
      not_checked_in: { Args: never; Returns: Json }
      rewind_minutes: { Args: { p_minutes: number }; Returns: Json }
      undo_last: { Args: never; Returns: Json }
      verify_admin_token: { Args: { p_token: string }; Returns: boolean }
      vip_inside_count: { Args: never; Returns: Json }
      who_is_inside: { Args: never; Returns: Json }
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
    Enums: {},
  },
} as const
