-- =============================================================================
-- Session archive enhancements: author_real_name + fetch indexes
-- =============================================================================

ALTER TABLE submitted_ideas
  ADD COLUMN IF NOT EXISTS author_real_name TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN submitted_ideas.author_real_name IS
  'Private real name of the submitting student (mentor archive).';
COMMENT ON COLUMN submitted_ideas.author_nickname IS
  'Public nickname of the submitting student.';

-- Efficient full-session archive fetches
CREATE INDEX IF NOT EXISTS idx_player_assignments_session_team
  ON player_assignments (session_id, team_id);

CREATE INDEX IF NOT EXISTS idx_player_assignments_player_uid
  ON player_assignments (player_uid);

CREATE INDEX IF NOT EXISTS idx_submitted_ideas_session_team
  ON submitted_ideas (session_id, team_id);

CREATE INDEX IF NOT EXISTS idx_submitted_ideas_session_created
  ON submitted_ideas (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_teams_session_number
  ON teams (session_id, team_number);
