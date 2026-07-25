import type {
  AssignPlayerParams,
  AssignPlayerResult,
  DailySession,
  PlayerAssignment,
  SubmittedIdea,
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
          domain: string;
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
          domain?: string;
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
          domain?: string;
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
          real_name: string;
          nickname: string;
          joined_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          team_id: string;
          player_uid: string;
          real_name?: string;
          nickname?: string;
          joined_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          team_id?: string;
          player_uid?: string;
          real_name?: string;
          nickname?: string;
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
      submitted_ideas: {
        Row: {
          id: string;
          session_id: string;
          team_id: string;
          author_player_uid: string;
          author_real_name: string;
          author_nickname: string;
          startup_name: string;
          one_sentence_solution: string;
          tools_integration: string;
          is_final_team_pitch: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          team_id: string;
          author_player_uid: string;
          author_real_name?: string;
          author_nickname: string;
          startup_name: string;
          one_sentence_solution: string;
          tools_integration: string;
          is_final_team_pitch?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          team_id?: string;
          author_player_uid?: string;
          author_real_name?: string;
          author_nickname?: string;
          startup_name?: string;
          one_sentence_solution?: string;
          tools_integration?: string;
          is_final_team_pitch?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "submitted_ideas_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "daily_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submitted_ideas_team_id_fkey";
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
          p_real_name: string;
          p_nickname: string;
        };
        Returns: {
          id: string;
          session_id: string;
          team_number: number;
          name: string;
          color: string;
          domain: string;
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

/** Narrow RPC/table row → domain Team. */
export function toTeam(
  row: Database["public"]["Functions"]["assign_player_atomically"]["Returns"]
): Team {
  if (!row.words || row.words.length !== 3) {
    throw new Error(`Team ${row.id} must have exactly 3 keywords`);
  }

  return {
    id: row.id,
    session_id: row.session_id,
    team_number: row.team_number,
    name: row.name,
    color: row.color,
    domain: (row.domain ?? "").trim(),
    words: row.words,
    max_capacity: row.max_capacity,
    current_count: row.current_count,
  };
}

export type {
  AssignPlayerParams,
  AssignPlayerResult,
  DailySession,
  PlayerAssignment,
  SubmittedIdea,
  Team,
};
