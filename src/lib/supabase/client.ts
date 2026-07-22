import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { toTeam, type AssignPlayerParams, type AssignPlayerResult, type Database } from "./types";

/**
 * Browser Supabase client (singleton).
 *
 * Use in Client Components for realtime subscriptions and RPC calls such as
 * `assign_player_atomically`. Prefer the server client in Server Components /
 * Route Handlers so cookies and secrets stay off the client bundle path.
 */
let browserClient: SupabaseClient<Database> | undefined;

export function createBrowserSupabaseClient(): SupabaseClient<Database> {
  if (browserClient) {
    return browserClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example → .env.local."
    );
  }

  browserClient = createClient<Database>(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  return browserClient;
}

/**
 * Atomically assign the current student to an open team slot.
 * Backed by Postgres FOR UPDATE locking — safe under 40 concurrent QR scans.
 */
export async function assignPlayerAtomically(
  params: AssignPlayerParams
): Promise<AssignPlayerResult> {
  const supabase = createBrowserSupabaseClient();

  const { data, error } = await supabase.rpc("assign_player_atomically", {
    p_session_id: params.p_session_id,
    p_player_uid: params.p_player_uid,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("assign_player_atomically returned no team");
  }

  return toTeam(data);
}
