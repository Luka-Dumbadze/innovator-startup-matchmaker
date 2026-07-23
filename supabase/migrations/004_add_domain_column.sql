-- =============================================================================
-- Target domain + 3 keywords (was 4 words)
-- =============================================================================

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS domain TEXT NOT NULL DEFAULT '';

-- Shrink legacy 4-word rows before tightening the check constraint.
UPDATE teams
SET words = words[1:3]
WHERE cardinality(words) > 3;

UPDATE teams
SET domain = 'ზოგადი'
WHERE btrim(domain) = '';

ALTER TABLE teams
  DROP CONSTRAINT IF EXISTS chk_teams_words_length;

ALTER TABLE teams
  ADD CONSTRAINT chk_teams_words_length
  CHECK (cardinality(words) = 3);

COMMENT ON COLUMN teams.domain IS
  'Target industry / sector for the team ideation challenge (Georgian label).';
