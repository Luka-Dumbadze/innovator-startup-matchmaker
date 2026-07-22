-- Enable Realtime for the Host big-screen view.
-- REPLICA IDENTITY FULL so session_id filters work on UPDATE/DELETE payloads.

ALTER TABLE teams REPLICA IDENTITY FULL;
ALTER TABLE player_assignments REPLICA IDENTITY FULL;
ALTER TABLE daily_sessions REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE teams;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE player_assignments;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE daily_sessions;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END;
$$;
