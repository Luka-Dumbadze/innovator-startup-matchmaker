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
          ended_at: string | null;
          voting_open: boolean;
          voting_team_id: string | null;
        };
        Insert: {
          id?: string;
          date_label: string;
          is_active?: boolean;
          created_at?: string;
          ended_at?: string | null;
          voting_open?: boolean;
          voting_team_id?: string | null;
        };
        Update: {
          id?: string;
          date_label?: string;
          is_active?: boolean;
          created_at?: string;
          ended_at?: string | null;
          voting_open?: boolean;
          voting_team_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "daily_sessions_voting_team_id_fkey";
            columns: ["voting_team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
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
          likes_count: number;
          dislikes_count: number;
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
          likes_count?: number;
          dislikes_count?: number;
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
          likes_count?: number;
          dislikes_count?: number;
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
      pitch_votes: {
        Row: {
          id: string;
          session_id: string;
          team_id: string;
          voter_player_uid: string;
          vote_type: "like" | "dislike";
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          team_id: string;
          voter_player_uid: string;
          vote_type: "like" | "dislike";
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          team_id?: string;
          voter_player_uid?: string;
          vote_type?: "like" | "dislike";
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pitch_votes_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "daily_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pitch_votes_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "teams";
            referencedColumns: ["id"];
          },
        ];
      };
      xy_sessions: {
        Row: {
          id: string;
          label: string;
          is_active: boolean;
          status: "active" | "completed";
          current_round: number;
          voting_open: boolean;
          created_at: string;
          ended_at: string | null;
        };
        Insert: {
          id?: string;
          label: string;
          is_active?: boolean;
          status?: "active" | "completed";
          current_round?: number;
          voting_open?: boolean;
          created_at?: string;
          ended_at?: string | null;
        };
        Update: {
          id?: string;
          label?: string;
          is_active?: boolean;
          status?: "active" | "completed";
          current_round?: number;
          voting_open?: boolean;
          created_at?: string;
          ended_at?: string | null;
        };
        Relationships: [];
      };
      xy_teams: {
        Row: {
          id: string;
          session_id: string;
          team_number: number;
          name: string;
          color: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          team_number: number;
          name: string;
          color?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          team_number?: number;
          name?: string;
          color?: string;
        };
        Relationships: [
          {
            foreignKeyName: "xy_teams_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "xy_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      xy_players: {
        Row: {
          id: string;
          session_id: string;
          player_uid: string;
          full_name: string;
          team_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          player_uid: string;
          full_name: string;
          team_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          player_uid?: string;
          full_name?: string;
          team_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "xy_players_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "xy_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "xy_players_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "xy_teams";
            referencedColumns: ["id"];
          },
        ];
      };
      xy_individual_votes: {
        Row: {
          id: string;
          session_id: string;
          round_number: number;
          player_id: string;
          vote: "X" | "Y";
          edited_by_mentor: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          round_number: number;
          player_id: string;
          vote: "X" | "Y";
          edited_by_mentor?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          round_number?: number;
          player_id?: string;
          vote?: "X" | "Y";
          edited_by_mentor?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "xy_individual_votes_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "xy_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "xy_individual_votes_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "xy_players";
            referencedColumns: ["id"];
          },
        ];
      };
      xy_team_votes: {
        Row: {
          id: string;
          session_id: string;
          round_number: number;
          team_id: string;
          vote: "X" | "Y";
          points: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          round_number: number;
          team_id: string;
          vote: "X" | "Y";
          points?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          round_number?: number;
          team_id?: string;
          vote?: "X" | "Y";
          points?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "xy_team_votes_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "xy_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "xy_team_votes_team_id_fkey";
            columns: ["team_id"];
            isOneToOne: false;
            referencedRelation: "xy_teams";
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
      cast_pitch_vote: {
        Args: {
          p_session_id: string;
          p_team_id: string;
          p_voter_uid: string;
          p_vote_type: string;
        };
        Returns: {
          likes_count: number;
          dislikes_count: number;
          vote_type: string;
        } | null;
      };
      set_session_voting_state: {
        Args: {
          p_session_id: string;
          p_voting_open: boolean;
          p_voting_team_id?: string | null;
        };
        Returns: {
          session_id: string;
          voting_open: boolean;
          voting_team_id: string | null;
        };
      };
      xy_join_player: {
        Args: {
          p_session_id: string;
          p_player_uid: string;
          p_full_name: string;
        };
        Returns: {
          id: string;
          session_id: string;
          player_uid: string;
          full_name: string;
          team_id: string | null;
          created_at: string;
        };
      };
      xy_cast_individual_vote: {
        Args: {
          p_session_id: string;
          p_player_uid: string;
          p_vote: string;
        };
        Returns: {
          round_number: number;
          player_id: string;
          vote: "X" | "Y";
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

/** Narrow session row → domain DailySession (defaults for voting columns). */
export function toDailySession(row: {
  id: string;
  date_label: string;
  is_active: boolean;
  created_at: string;
  ended_at?: string | null;
  voting_open?: boolean | null;
  voting_team_id?: string | null;
}): DailySession {
  return {
    id: row.id,
    date_label: row.date_label,
    is_active: row.is_active,
    created_at: row.created_at,
    ended_at: row.ended_at ?? null,
    voting_open: Boolean(row.voting_open),
    voting_team_id: row.voting_team_id ?? null,
  };
}

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
