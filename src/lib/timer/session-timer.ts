import type { RealtimeChannel } from "@supabase/supabase-js";

/** Structured morning flow modes. */
export type TimerMode = "solo_brainstorm" | "team_brainstorm" | "pitch";

export type TimerBroadcastEvent =
  | "TIMER_STARTED"
  | "TIMER_PAUSED"
  | "TIMER_RESET"
  | "TIMER_EXPIRED";

export type TimerStartedPayload = {
  mode: TimerMode;
  secondsRemaining: number;
};

export type TimerPausedPayload = {
  mode: TimerMode;
  secondsRemaining: number;
};

export type TimerResetPayload = {
  mode: TimerMode;
  secondsRemaining: number;
};

export type TimerExpiredPayload = {
  mode: TimerMode;
  secondsRemaining: 0;
};

export type TimerBroadcastPayload =
  | TimerStartedPayload
  | TimerPausedPayload
  | TimerResetPayload
  | TimerExpiredPayload;

export const MODE_SECONDS: Record<TimerMode, number> = {
  solo_brainstorm: 2 * 60,
  team_brainstorm: 10 * 60,
  pitch: 60,
};

export const MODE_LABELS: Record<TimerMode, string> = {
  solo_brainstorm: "2-Min Solo",
  team_brainstorm: "10-Min Team",
  pitch: "1-Min Pitch",
};

export const MODE_SHORT_LABELS: Record<TimerMode, string> = {
  solo_brainstorm: "Solo",
  team_brainstorm: "Team",
  pitch: "Pitch",
};

export type PhaseGuidance = {
  title: string;
  instruction: string;
  tone: "solo" | "team" | "pitch";
};

export const PHASE_GUIDANCE: Record<TimerMode, PhaseGuidance> = {
  solo_brainstorm: {
    title: "🤫 ინდივიდუალური ფაზა (2 წთ)",
    instruction: "ჯერ იფიქრეთ დამოუკიდებლად! ნუ მოძებნით გუნდის წევრებს.",
    tone: "solo",
  },
  team_brainstorm: {
    title: "🤝 გუნდური ფაზა (10 წთ)",
    instruction: "იპოვეთ თქვენი ფერის/ნომრის გუნდელები და ერთად დახვეწეთ იდეა!",
    tone: "team",
  },
  pitch: {
    title: "🎤 პიჩინგის ფაზა (1 წთ)",
    instruction: "მოემზადეთ იდეის წარსადგენად!",
    tone: "pitch",
  },
};

export const SOLO_TO_TEAM_NOTICE =
  "🔔 2 წუთი გავიდა! ახლა იპოვეთ თქვენი გუნდის წევრები!";

export function sessionTimerChannelName(sessionId: string): string {
  return `session-timer-${sessionId}`;
}

export function parseTimerMode(value: unknown): TimerMode {
  if (value === "solo_brainstorm" || value === "team_brainstorm" || value === "pitch") {
    return value;
  }
  // Legacy single brainstorm mode → team phase
  if (value === "brainstorm") {
    return "team_brainstorm";
  }
  return "solo_brainstorm";
}

export function formatTimerClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export async function broadcastTimerEvent(
  channel: RealtimeChannel | null,
  event: TimerBroadcastEvent,
  payload: TimerBroadcastPayload
): Promise<void> {
  if (!channel) return;
  await channel.send({
    type: "broadcast",
    event,
    payload,
  });
}

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

let alarmContext: AudioContext | null = null;
let alarmPulseTimer: number | null = null;

function getAudioContext(): AudioContext | null {
  try {
    const w = window as AudioWindow;
    const Ctor = window.AudioContext || w.webkitAudioContext;
    if (!Ctor) return null;
    return new Ctor();
  } catch {
    return null;
  }
}

function playAlarmPulse(ctx: AudioContext): void {
  const now = ctx.currentTime;
  const freqs = [880, 988, 880, 1175];

  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = i % 2 === 0 ? "square" : "sawtooth";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + i * 0.09);
    gain.gain.exponentialRampToValueAtTime(0.28, now + i * 0.09 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + i * 0.09);
    osc.stop(now + i * 0.09 + 0.14);
  });
}

/** Loud looping alarm until `stopExpiryAlarm()` — synthesized, no audio files. */
export function startExpiryAlarm(): void {
  stopExpiryAlarm();

  const ctx = getAudioContext();
  if (!ctx) return;

  alarmContext = ctx;
  void ctx.resume();
  playAlarmPulse(ctx);

  alarmPulseTimer = window.setInterval(() => {
    if (!alarmContext) return;
    void alarmContext.resume();
    playAlarmPulse(alarmContext);
  }, 700);
}

export function stopExpiryAlarm(): void {
  if (alarmPulseTimer !== null) {
    window.clearInterval(alarmPulseTimer);
    alarmPulseTimer = null;
  }
  if (alarmContext) {
    void alarmContext.close();
    alarmContext = null;
  }
}

export function triggerExpiryVibration(): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([300, 100, 300, 100, 500]);
    }
  } catch {
    // Unsupported / blocked — ignore.
  }
}

/** Soft Solo → Team handoff cue. */
export function playPhaseTransitionChime(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    void ctx.resume();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99];

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.18, now + i * 0.14 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.14 + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.14);
      osc.stop(now + i * 0.14 + 0.32);
    });

    window.setTimeout(() => {
      void ctx.close();
    }, 1200);
  } catch {
    // ignore
  }
}

export function triggerPhaseTransitionVibration(): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([200, 100, 200]);
    }
  } catch {
    // ignore
  }
}
