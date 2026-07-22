import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import type { Database } from "./types";

function requireEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example → .env.local and restart the Next.js server.`
    );
  }
  return value;
}

/**
 * Cookie-aware Supabase client for Next.js App Router (Server Components,
 * Server Actions, Route Handlers).
 *
 * `cookies()` is async in this Next.js version — always await it.
 * Setting cookies may fail in pure Server Components (read-only render);
 * that is expected and safe to ignore when only reading data.
 */
export async function createServerSupabaseClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component — cookie writes are ignored.
            // Middleware or a Route Handler / Server Action can refresh the session.
          }
        },
      },
    }
  );
}

/**
 * Stateless anon client (no cookies). Fine for public reads / RPC calls from
 * Route Handlers that do not need a user session.
 */
export function createServiceSupabaseClient(): SupabaseClient<Database> {
  return createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

/**
 * Service-role client for mentor/admin mutations.
 * Bypasses RLS — never import this into Client Components or expose the key.
 */
export function createAdminSupabaseClient(): SupabaseClient<Database> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Add it to .env.local (Supabase → Settings → API)."
    );
  }

  return createClient<Database>(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
