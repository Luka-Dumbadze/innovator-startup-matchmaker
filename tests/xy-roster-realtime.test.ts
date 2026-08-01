import { describe, expect, it } from "vitest";

import {
  XY_GENERIC_JOIN_ERROR,
  describeXyError,
} from "@/lib/xy/errors";
import {
  applyXyIndividualVoteEvent,
} from "@/lib/xy/individual-votes";
import {
  applyXyPlayerEvent,
  normalizeXyPlayerRow,
} from "@/lib/xy/roster";
import type { XYIndividualVote, XYPlayer } from "@/types/xy";

function makePlayer(overrides: Partial<XYPlayer> = {}): XYPlayer {
  return {
    id: "player-1",
    session_id: "session-1",
    player_uid: "uid-1",
    full_name: "ნინო ბერიძე",
    real_name: "ნინო ბერიძე",
    team_id: null,
    team_number: null,
    created_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("normalizeXyPlayerRow", () => {
  it("accepts either name column", () => {
    expect(
      normalizeXyPlayerRow({
        id: "p1",
        session_id: "s1",
        player_uid: "u1",
        real_name: "ლუკა",
        created_at: "2026-08-01T00:00:00.000Z",
      })
    ).toMatchObject({ full_name: "ლუკა", real_name: "ლუკა" });
  });

  it("rejects a row without an id", () => {
    expect(normalizeXyPlayerRow({ player_uid: "u1" })).toBeNull();
    expect(normalizeXyPlayerRow(null)).toBeNull();
  });
});

describe("applyXyPlayerEvent", () => {
  const sessionId = "session-1";

  it("appends a newly joined student in join order", () => {
    const existing = [
      makePlayer({ id: "p1", created_at: "2026-08-01T00:00:00.000Z" }),
    ];

    const next = applyXyPlayerEvent(
      existing,
      {
        eventType: "INSERT",
        new: {
          id: "p2",
          session_id: sessionId,
          player_uid: "uid-2",
          full_name: "ლუკა კაპანაძე",
          created_at: "2026-08-01T00:00:01.000Z",
        },
      },
      sessionId
    );

    expect(next).toHaveLength(2);
    expect(next[1]?.full_name).toBe("ლუკა კაპანაძე");
    expect(next).not.toBe(existing);
  });

  it("updates an existing student when the mentor assigns a team", () => {
    const existing = [makePlayer()];

    const next = applyXyPlayerEvent(
      existing,
      {
        eventType: "UPDATE",
        new: {
          id: "player-1",
          session_id: sessionId,
          player_uid: "uid-1",
          full_name: "ნინო ბერიძე",
          team_id: "team-3",
          created_at: "2026-08-01T00:00:00.000Z",
        },
      },
      sessionId
    );

    expect(next).toHaveLength(1);
    expect(next[0]?.team_id).toBe("team-3");
  });

  it("removes a deleted student", () => {
    const existing = [makePlayer(), makePlayer({ id: "p2", player_uid: "uid-2" })];

    const next = applyXyPlayerEvent(
      existing,
      { eventType: "DELETE", old: { id: "player-1" } },
      sessionId
    );

    expect(next.map((p) => p.id)).toEqual(["p2"]);
  });

  it("ignores events from another session", () => {
    const existing = [makePlayer()];

    const next = applyXyPlayerEvent(
      existing,
      {
        eventType: "INSERT",
        new: {
          id: "p9",
          session_id: "other-session",
          player_uid: "uid-9",
          full_name: "სხვა",
          created_at: "2026-08-01T00:00:09.000Z",
        },
      },
      sessionId
    );

    expect(next).toBe(existing);
  });

  it("returns the same array when nothing changed", () => {
    const existing = [makePlayer()];

    const next = applyXyPlayerEvent(
      existing,
      {
        eventType: "UPDATE",
        new: {
          id: "player-1",
          session_id: sessionId,
          player_uid: "uid-1",
          full_name: "ნინო ბერიძე",
          team_id: null,
          created_at: "2026-08-01T00:00:00.000Z",
        },
      },
      sessionId
    );

    expect(next).toBe(existing);
  });

  it("merges a rejoin that shares the same player_uid", () => {
    const existing = [makePlayer({ id: "old-id" })];

    const next = applyXyPlayerEvent(
      existing,
      {
        eventType: "INSERT",
        new: {
          id: "new-id",
          session_id: sessionId,
          player_uid: "uid-1",
          full_name: "ნინო ბერიძე",
          created_at: "2026-08-01T00:00:00.000Z",
        },
      },
      sessionId
    );

    expect(next).toHaveLength(1);
    expect(next[0]?.id).toBe("new-id");
  });
});

describe("applyXyIndividualVoteEvent", () => {
  const sessionId = "session-1";

  function makeVote(overrides: Partial<XYIndividualVote> = {}): XYIndividualVote {
    return {
      id: "vote-1",
      session_id: sessionId,
      round_number: 1,
      player_id: "player-1",
      vote: "X",
      edited_by_mentor: false,
      edited_at: null,
      ...overrides,
    };
  }

  it("appends a newly cast phone vote", () => {
    const next = applyXyIndividualVoteEvent(
      [],
      {
        eventType: "INSERT",
        new: {
          id: "vote-1",
          session_id: sessionId,
          round_number: 1,
          player_id: "player-1",
          vote: "Y",
          edited_by_mentor: false,
        },
      },
      sessionId
    );

    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ vote: "Y", player_id: "player-1" });
  });

  it("updates an existing vote in place for the same player/round", () => {
    const existing = [makeVote()];

    const next = applyXyIndividualVoteEvent(
      existing,
      {
        eventType: "UPDATE",
        new: {
          id: "vote-1",
          session_id: sessionId,
          round_number: 1,
          player_id: "player-1",
          vote: "Y",
          edited_by_mentor: false,
        },
      },
      sessionId
    );

    expect(next).toHaveLength(1);
    expect(next[0]?.vote).toBe("Y");
  });

  it("removes a cleared vote from the submission roster", () => {
    const existing = [makeVote(), makeVote({ id: "vote-2", player_id: "player-2" })];

    const next = applyXyIndividualVoteEvent(
      existing,
      { eventType: "DELETE", old: { id: "vote-1" } },
      sessionId
    );

    expect(next.map((v) => v.id)).toEqual(["vote-2"]);
  });

  it("ignores votes from another session", () => {
    const existing = [makeVote()];

    const next = applyXyIndividualVoteEvent(
      existing,
      {
        eventType: "INSERT",
        new: {
          id: "vote-9",
          session_id: "other-session",
          round_number: 1,
          player_id: "player-9",
          vote: "X",
        },
      },
      sessionId
    );

    expect(next).toBe(existing);
  });
});

describe("describeXyError", () => {
  it("maps tagged RPC exceptions to student-facing Georgian copy", () => {
    expect(
      describeXyError(
        new Error("XY_SESSION_NOT_ACTIVE: abc-123"),
        XY_GENERIC_JOIN_ERROR
      )
    ).toBe("სესია აქტიური აღარ არის — დაელოდეთ მენტორს");

    expect(
      describeXyError("FULL_NAME_REQUIRED", XY_GENERIC_JOIN_ERROR)
    ).toBe("ჩაწერეთ სახელი და გვარი");
  });

  it("appends an unknown message rather than hiding it", () => {
    expect(describeXyError(new Error("permission denied"), XY_GENERIC_JOIN_ERROR)).toBe(
      `${XY_GENERIC_JOIN_ERROR} (permission denied)`
    );
  });

  it("falls back when the error carries no text", () => {
    expect(describeXyError(null, XY_GENERIC_JOIN_ERROR)).toBe(XY_GENERIC_JOIN_ERROR);
  });
});
