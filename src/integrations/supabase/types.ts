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
      agent_status: {
        Row: {
          active_scans: number
          agent_name: string
          created_at: string
          health: string
          id: string
          last_heartbeat_at: string | null
          metrics: Json
          queue_size: number
          updated_at: string
          version: string | null
        }
        Insert: {
          active_scans?: number
          agent_name?: string
          created_at?: string
          health?: string
          id?: string
          last_heartbeat_at?: string | null
          metrics?: Json
          queue_size?: number
          updated_at?: string
          version?: string | null
        }
        Update: {
          active_scans?: number
          agent_name?: string
          created_at?: string
          health?: string
          id?: string
          last_heartbeat_at?: string | null
          metrics?: Json
          queue_size?: number
          updated_at?: string
          version?: string | null
        }
        Relationships: []
      }
      assets: {
        Row: {
          created_at: string
          criticality: Database["public"]["Enums"]["severity"]
          environment: string
          id: string
          identifier: string
          kind: Database["public"]["Enums"]["asset_kind"]
          monitored: boolean
          name: string
          notes: string | null
          owner_team: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          criticality?: Database["public"]["Enums"]["severity"]
          environment?: string
          id?: string
          identifier: string
          kind?: Database["public"]["Enums"]["asset_kind"]
          monitored?: boolean
          name: string
          notes?: string | null
          owner_team?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          criticality?: Database["public"]["Enums"]["severity"]
          environment?: string
          id?: string
          identifier?: string
          kind?: Database["public"]["Enums"]["asset_kind"]
          monitored?: boolean
          name?: string
          notes?: string | null
          owner_team?: string | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_label: string
          created_at: string
          detail: Json
          entity_id: string | null
          entity_type: string | null
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_label?: string
          created_at?: string
          detail?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_label?: string
          created_at?: string
          detail?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: string
        }
        Relationships: []
      }
      hermes_api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          key_hash: string
          key_prefix: string
          label: string
          last_used_at: string | null
          revoked: boolean
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          label: string
          last_used_at?: string | null
          revoked?: boolean
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          label?: string
          last_used_at?: string | null
          revoked?: boolean
        }
        Relationships: []
      }
      hermes_commands: {
        Row: {
          args: Json
          command: string
          completed_at: string | null
          created_at: string
          dispatched_at: string | null
          error: string | null
          id: string
          issued_by: string | null
          result: Json | null
          status: Database["public"]["Enums"]["command_status"]
          updated_at: string
        }
        Insert: {
          args?: Json
          command: string
          completed_at?: string | null
          created_at?: string
          dispatched_at?: string | null
          error?: string | null
          id?: string
          issued_by?: string | null
          result?: Json | null
          status?: Database["public"]["Enums"]["command_status"]
          updated_at?: string
        }
        Update: {
          args?: Json
          command?: string
          completed_at?: string | null
          created_at?: string
          dispatched_at?: string | null
          error?: string | null
          id?: string
          issued_by?: string | null
          result?: Json | null
          status?: Database["public"]["Enums"]["command_status"]
          updated_at?: string
        }
        Relationships: []
      }
      hermes_policies: {
        Row: {
          auto_approved_actions: string[]
          created_at: string
          id: string
          maintenance_window: string | null
          min_severity_to_act: Database["public"]["Enums"]["severity"]
          mode: string
          notes: string | null
          paused: boolean
          scan_schedule: string
          singleton: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          auto_approved_actions?: string[]
          created_at?: string
          id?: string
          maintenance_window?: string | null
          min_severity_to_act?: Database["public"]["Enums"]["severity"]
          mode?: string
          notes?: string | null
          paused?: boolean
          scan_schedule?: string
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          auto_approved_actions?: string[]
          created_at?: string
          id?: string
          maintenance_window?: string | null
          min_severity_to_act?: Database["public"]["Enums"]["severity"]
          mode?: string
          notes?: string | null
          paused?: boolean
          scan_schedule?: string
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      incidents: {
        Row: {
          affected_assets: string[]
          category: string | null
          closed_at: string | null
          contained_at: string | null
          created_at: string
          detected_at: string
          id: string
          lead: string | null
          phase: Database["public"]["Enums"]["incident_phase"]
          reference: string
          severity: Database["public"]["Enums"]["severity"]
          source: string
          summary: string | null
          timeline: Json
          title: string
          updated_at: string
        }
        Insert: {
          affected_assets?: string[]
          category?: string | null
          closed_at?: string | null
          contained_at?: string | null
          created_at?: string
          detected_at?: string
          id?: string
          lead?: string | null
          phase?: Database["public"]["Enums"]["incident_phase"]
          reference: string
          severity?: Database["public"]["Enums"]["severity"]
          source?: string
          summary?: string | null
          timeline?: Json
          title: string
          updated_at?: string
        }
        Update: {
          affected_assets?: string[]
          category?: string | null
          closed_at?: string | null
          contained_at?: string | null
          created_at?: string
          detected_at?: string
          id?: string
          lead?: string | null
          phase?: Database["public"]["Enums"]["incident_phase"]
          reference?: string
          severity?: Database["public"]["Enums"]["severity"]
          source?: string
          summary?: string | null
          timeline?: Json
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      response_actions: {
        Row: {
          action_type: string
          asset_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          executed_at: string | null
          id: string
          incident_id: string | null
          payload: Json
          rationale: string | null
          requested_by: string
          result: Json | null
          risk: Database["public"]["Enums"]["severity"]
          status: Database["public"]["Enums"]["action_status"]
          title: string
          updated_at: string
          vulnerability_id: string | null
        }
        Insert: {
          action_type: string
          asset_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          executed_at?: string | null
          id?: string
          incident_id?: string | null
          payload?: Json
          rationale?: string | null
          requested_by?: string
          result?: Json | null
          risk?: Database["public"]["Enums"]["severity"]
          status?: Database["public"]["Enums"]["action_status"]
          title: string
          updated_at?: string
          vulnerability_id?: string | null
        }
        Update: {
          action_type?: string
          asset_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          executed_at?: string | null
          id?: string
          incident_id?: string | null
          payload?: Json
          rationale?: string | null
          requested_by?: string
          result?: Json | null
          risk?: Database["public"]["Enums"]["severity"]
          status?: Database["public"]["Enums"]["action_status"]
          title?: string
          updated_at?: string
          vulnerability_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "response_actions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "response_actions_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "response_actions_vulnerability_id_fkey"
            columns: ["vulnerability_id"]
            isOneToOne: false
            referencedRelation: "vulnerabilities"
            referencedColumns: ["id"]
          },
        ]
      }
      scans: {
        Row: {
          asset_id: string | null
          created_at: string
          error: string | null
          findings_count: number
          finished_at: string | null
          id: string
          progress: number
          scan_type: string
          started_at: string | null
          started_by: string | null
          status: Database["public"]["Enums"]["scan_status"]
          target: string
          updated_at: string
        }
        Insert: {
          asset_id?: string | null
          created_at?: string
          error?: string | null
          findings_count?: number
          finished_at?: string | null
          id?: string
          progress?: number
          scan_type?: string
          started_at?: string | null
          started_by?: string | null
          status?: Database["public"]["Enums"]["scan_status"]
          target: string
          updated_at?: string
        }
        Update: {
          asset_id?: string | null
          created_at?: string
          error?: string | null
          findings_count?: number
          finished_at?: string | null
          id?: string
          progress?: number
          scan_type?: string
          started_at?: string | null
          started_by?: string | null
          status?: Database["public"]["Enums"]["scan_status"]
          target?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scans_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vulnerabilities: {
        Row: {
          asset_id: string | null
          assigned_to: string | null
          category: string | null
          created_at: string
          cve: string | null
          cvss: number | null
          description: string | null
          detected_at: string
          due_at: string | null
          evidence: Json
          fingerprint: string
          id: string
          remediation: string | null
          resolved_at: string | null
          severity: Database["public"]["Enums"]["severity"]
          source: string
          status: Database["public"]["Enums"]["vuln_status"]
          title: string
          updated_at: string
        }
        Insert: {
          asset_id?: string | null
          assigned_to?: string | null
          category?: string | null
          created_at?: string
          cve?: string | null
          cvss?: number | null
          description?: string | null
          detected_at?: string
          due_at?: string | null
          evidence?: Json
          fingerprint: string
          id?: string
          remediation?: string | null
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["severity"]
          source?: string
          status?: Database["public"]["Enums"]["vuln_status"]
          title: string
          updated_at?: string
        }
        Update: {
          asset_id?: string | null
          assigned_to?: string | null
          category?: string | null
          created_at?: string
          cve?: string | null
          cvss?: number | null
          description?: string | null
          detected_at?: string
          due_at?: string | null
          evidence?: Json
          fingerprint?: string
          id?: string
          remediation?: string | null
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["severity"]
          source?: string
          status?: Database["public"]["Enums"]["vuln_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vulnerabilities_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      action_status:
        | "pending_approval"
        | "approved"
        | "rejected"
        | "executing"
        | "succeeded"
        | "failed"
      app_role: "admin" | "analyst" | "viewer"
      asset_kind:
        | "host"
        | "domain"
        | "repository"
        | "cloud"
        | "endpoint"
        | "database"
        | "saas"
      command_status:
        | "pending"
        | "dispatched"
        | "acknowledged"
        | "succeeded"
        | "failed"
        | "cancelled"
      incident_phase:
        | "open"
        | "contained"
        | "eradicated"
        | "recovered"
        | "closed"
      scan_status: "queued" | "running" | "completed" | "failed" | "cancelled"
      severity: "critical" | "high" | "medium" | "low" | "info"
      vuln_status:
        | "new"
        | "triaging"
        | "confirmed"
        | "false_positive"
        | "mitigating"
        | "resolved"
        | "risk_accepted"
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
      action_status: [
        "pending_approval",
        "approved",
        "rejected",
        "executing",
        "succeeded",
        "failed",
      ],
      app_role: ["admin", "analyst", "viewer"],
      asset_kind: [
        "host",
        "domain",
        "repository",
        "cloud",
        "endpoint",
        "database",
        "saas",
      ],
      command_status: [
        "pending",
        "dispatched",
        "acknowledged",
        "succeeded",
        "failed",
        "cancelled",
      ],
      incident_phase: [
        "open",
        "contained",
        "eradicated",
        "recovered",
        "closed",
      ],
      scan_status: ["queued", "running", "completed", "failed", "cancelled"],
      severity: ["critical", "high", "medium", "low", "info"],
      vuln_status: [
        "new",
        "triaging",
        "confirmed",
        "false_positive",
        "mitigating",
        "resolved",
        "risk_accepted",
      ],
    },
  },
} as const
