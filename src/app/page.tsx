import Link from "next/link";
import { Monitor, Smartphone, Wrench, ArrowUpRight } from "lucide-react";

const FEATURES = [
  {
    href: "/play",
    emoji: "📱",
    title: "Participant / Play",
    description: "Scan, get assigned to a team, and brainstorm your pitch on mobile.",
    icon: Smartphone,
    accent: "from-teal-500/20 to-transparent",
    ring: "hover:ring-teal-400/50",
  },
  {
    href: "/host",
    emoji: "🖥️",
    title: "Big Screen Host",
    description: "Project live team fills, QR join code, and timers for the hall.",
    icon: Monitor,
    accent: "from-sky-500/20 to-transparent",
    ring: "hover:ring-sky-400/50",
  },
  {
    href: "/admin",
    emoji: "🛠️",
    title: "Mentor Admin Panel",
    description: "Activate daily sessions, manage Georgian word presets, and reset seats.",
    icon: Wrench,
    accent: "from-amber-500/20 to-transparent",
    ring: "hover:ring-amber-400/50",
  },
] as const;

export default function HomePage() {
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-slate-950 text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(45,212,191,0.22),transparent),radial-gradient(ellipse_50%_40%_at_100%_100%,rgba(14,165,233,0.12),transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 text-xs font-bold tracking-[0.22em] text-teal-300 uppercase sm:text-sm">
            Innovation Summer School Platform
          </p>
          <h1 className="text-4xl font-black tracking-tight text-balance sm:text-5xl md:text-6xl">
            Innovator Startup Matchmaker
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-400 sm:text-lg">
            Atomic team assignment for 40 students, live big-screen sync, and mentor tooling —
            built for one intense morning at a time.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {FEATURES.map(({ href, emoji, title, description, icon: Icon, accent, ring }) => (
            <Link
              key={href}
              href={href}
              className={`group relative flex flex-col rounded-3xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-slate-600 hover:shadow-[0_20px_50px_-24px_rgba(45,212,191,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${ring}`}
            >
              <div
                aria-hidden
                className={`pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-br ${accent} opacity-80`}
              />
              <div className="relative flex items-start justify-between gap-3">
                <div className="flex size-11 items-center justify-center rounded-2xl bg-slate-950/80 ring-1 ring-slate-700">
                  <Icon className="size-5 text-teal-300" aria-hidden />
                </div>
                <ArrowUpRight className="size-5 text-slate-500 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-teal-300" />
              </div>
              <h2 className="relative mt-5 text-lg font-bold tracking-tight text-white">
                <span aria-hidden className="mr-1.5">
                  {emoji}
                </span>
                {title}
              </h2>
              <p className="relative mt-2 flex-1 text-sm leading-relaxed text-slate-400">
                {description}
              </p>
              <span className="relative mt-5 text-xs font-bold tracking-wide text-teal-300 uppercase">
                Open {href}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
