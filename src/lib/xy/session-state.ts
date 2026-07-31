import type { XYSession, XYSessionStatus } from "@/types/xy";

/** A live XY session is `is_active = true` AND `status = 'active'`. */
export const XY_STATUS_ACTIVE: XYSessionStatus = "active";
export const XY_STATUS_COMPLETED: XYSessionStatus = "completed";

/** Mirrors the `xy_sessions.label` column default. */
export const XY_DEFAULT_SESSION_LABEL = "XY თამაში";

export const XY_SESSION_LABEL_MAX = 80;

/** Never persist a blank label — every XY screen renders it as a heading. */
export function resolveXySessionLabel(label: string | null | undefined): string {
  const cleaned = (label ?? "").trim().slice(0, XY_SESSION_LABEL_MAX);
  return cleaned || XY_DEFAULT_SESSION_LABEL;
}

export function parseXySessionStatus(value: unknown): XYSessionStatus | null {
  return value === "active" || value === "completed" ? value : null;
}

type LivenessFields = Pick<XYSession, "is_active" | "status">;

/**
 * Both flags must agree before a session drives the game. The DB enforces the
 * same invariant with a CHECK constraint, so a drifted row is a hard bug.
 */
export function isXySessionLive(
  session: LivenessFields | null | undefined
): boolean {
  if (!session) return false;
  return session.is_active === true && session.status === XY_STATUS_ACTIVE;
}

/** Patch that starts a session — keeps `is_active` and `status` in lockstep. */
export function xySessionStartPatch(): {
  is_active: true;
  status: XYSessionStatus;
  ended_at: null;
} {
  return { is_active: true, status: XY_STATUS_ACTIVE, ended_at: null };
}

/** Patch that retires a session — never set one flag without the other. */
export function xySessionEndPatch(endedAt: Date = new Date()): {
  is_active: false;
  status: XYSessionStatus;
  ended_at: string;
} {
  return {
    is_active: false,
    status: XY_STATUS_COMPLETED,
    ended_at: endedAt.toISOString(),
  };
}
