import type {
  AssignPlayerParams,
  AssignPlayerResult,
  DailySession,
  PlayerAssignment,
  Team,
} from "@/types/game";

/**
 * Minimal Supabase Database typing for the matchmaker schema.
 * Inline Row shapes (not interfaces) so they satisfy GenericTable's
 * `Record<string, unknown>` constraint used by @supabase/supabase-js.
 */
export type Database = {
  public: {
    Tables: {
      daily_sessions: {
        Row: {
          id: string;
          date_label: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          date_label: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          date_label?: string;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      teams: {
        Row: {
          id: string;
          session_id: string;
          team_number: number;
          name: string;
          color: string;
          words: string[];
          max_capacity: number;
          current_count: number;
        };
        Insert: {
          id?: string;
          session_id: string;
          team_number: number;
          name: string;
          color: string;
          words: string[];
          max_capacity?: number;
          current_count?: number;
        };
        Update: {
          id?: string;
          session_id?: string;
          team_number?: number;
          name?: string;
          color?: string;
          words?: string[];
          max_capacity?: number;
          current_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "teams_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "daily_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      player_assignments: {
        Row: {
          id: string;
          session_id: string;
          team_id: string;
          player_uid: string;
          joined_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          team_id: string;
          player_uid: string;
          joined_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          team_id?: string;
          player_uid?: string;
          joined_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "player_assignments_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "daily_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "player_assignments_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      assign_player_atomically: {
        Args: {
          p_session_id: string;
          p_player_uid: string;
        };
        Returns: {
          id: string;
          session_id: string;
          team_number: number;
          name: string;
          color: string;
          words: string[];
          max_capacity: number;
          current_count: number;
        };
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

/** Narrow RPC row → domain Team (words tuple). */
export function toTeam(row: Database["public"]["Functions"]["assign_player_atomically"]["Returns"]): Team {
  if (!row.words || row.words.length !== 4) {
    throw new Error(`Team ${row.id} must have exactly 4 words`);
  }

  return {
    ...row,
    words: [row.words[0], row.words[1], row.words[2], row.words[3]],
  };
}

export type {
  AssignPlayerParams,
  AssignPlayerResult,
  DailySession,
  PlayerAssignment,
  Team,
};
