"use client";

import { AlertTriangle, X } from "lucide-react";

type XyErrorBannerProps = {
  /** Nulls are ignored; duplicates are collapsed. */
  messages: (string | null | undefined)[];
  onDismiss?: () => void;
};

/**
 * Pinned red banner for XY failures. Toasts disappear after a few seconds,
 * which is not long enough to read a Postgres error, so the exact message stays
 * here until the next successful action.
 */
export function XyErrorBanner({ messages, onDismiss }: XyErrorBannerProps) {
  const unique = [...new Set(messages.filter((m): m is string => !!m?.trim()))];
  if (unique.length === 0) return null;

  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-3"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-300" />
      <div className="flex-1 space-y-1">
        {unique.map((message) => (
          <p
            key={message}
            className="font-[family-name:var(--font-noto-georgian)] text-sm leading-snug break-words text-rose-100"
          >
            {message}
          </p>
        ))}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="rounded-md p-0.5 text-rose-200 opacity-70 transition hover:opacity-100"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
