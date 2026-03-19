"use client";

import Link from "next/link";
import { useAuth } from "@/context/auth-context";

function FluxLogoIcon({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 44 44" fill="none" className={className} aria-hidden>
      <path d="M8 32L16 20L24 26L36 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M30 10H36V16" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="20" r="2.5" fill="rgba(253,167,223,0.8)" />
      <circle cx="24" cy="26" r="2.5" fill="rgba(0,210,211,0.8)" />
      <path d="M8 36H36" stroke="rgba(255,255,255,0.3)" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

const features = [
  {
    title: "Visual and dynamic Kanban",
    description:
      "Organize work by stages, move cards effortlessly, and keep the whole team aligned in the same delivery flow.",
  },
  {
    title: "Priority and focus management",
    description:
      "Highlight what drives business impact and avoid bottlenecks with a clear view of backlog, active tasks, and next steps.",
  },
  {
    title: "Outcome-oriented workflow",
    description:
      "Turn planning into execution with a platform designed for commercial, operational, and digital product teams.",
  },
];

const innovations = [
  "Daily insights and intelligent board-level progress analysis.",
  "An extensible model for routines, alerts, and follow-up automations.",
  "A foundation ready to integrate AI for prioritization, summaries, and recommendations.",
];

const practicalItems = [
  "A short learning curve for fast team adoption.",
  "A centralized workspace to reduce rework and scattered communication.",
  "A clean, responsive experience aligned with the Flux-Board identity.",
];

export default function HomePage() {
  const { user } = useAuth();
  const aestheticVariant: "sober" | "vibrant" = "vibrant";

  return (
    <main
      className={`home-variant-${aestheticVariant} relative min-h-screen overflow-hidden bg-[var(--flux-surface-dark)] text-[var(--flux-text)]`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-45"
        style={{
          backgroundImage: "var(--flux-home-hero-bg)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
        aria-hidden
      />
      <div className="mx-auto w-full max-w-6xl px-6 py-6 md:px-10">
        <header className="hero-shell relative z-10 flex items-center justify-between rounded-[var(--flux-rad-xl)] border px-5 py-4 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-[10px]"
              style={{
                background: "linear-gradient(135deg, var(--flux-primary), var(--flux-primary-dark))",
                boxShadow: "0 8px 20px rgba(108,92,231,0.35)",
              }}
            >
              <FluxLogoIcon className="h-5 w-5" />
            </div>
            <div>
              <p className="font-display text-base font-bold tracking-tight">Flux-Board</p>
              <p className="text-xs text-[var(--flux-text-muted)]">Organize the flow. Deliver what matters.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user ? (
              <Link href="/boards" className="btn-primary">
                Open platform
              </Link>
            ) : (
              <Link href="/login" className="btn-primary">
                Sign in
              </Link>
            )}
          </div>
        </header>

        <section className="hero-panel relative z-10 mt-8 overflow-hidden rounded-[var(--flux-rad-xl)] border p-8 md:p-12">
          <div className="hero-glow-cyan absolute right-[-120px] top-[-140px] h-64 w-64 rounded-full blur-3xl" />
          <div className="hero-glow-pink absolute bottom-[-100px] left-[-80px] h-56 w-56 rounded-full blur-3xl" />
          <div className="relative grid gap-8 md:grid-cols-[1.2fr_0.8fr] md:items-center">
            <div>
              <p className="hero-chip inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide">
                Business platform for operations and growth
              </p>
              <h1 className="mt-4 max-w-2xl font-display text-3xl font-bold leading-tight md:text-5xl">
                Centralize tasks, improve team cadence, and scale delivery with Flux-Board.
              </h1>
              <p className="mt-4 max-w-xl text-sm text-[var(--flux-text-muted)] md:text-base">
                This official single-page experience presents a solution ready for commercial use: visual management, smart prioritization, and clear
                execution for companies that need speed without losing organization.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/login" className="btn-primary">
                  Sign in to get started
                </Link>
                <Link href="#funcionalidades" className="btn-secondary">
                  Explore features
                </Link>
              </div>
            </div>

            <div className="hero-spotlight rounded-[var(--flux-rad-lg)] border p-5 shadow-[var(--shadow-md)]">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--flux-secondary)]">Solution highlights</p>
              <ul className="mt-3 space-y-3">
                <li className="hero-list-card rounded-[var(--flux-rad)] border px-3 py-2 text-sm">
                  Complete visibility across boards, tasks, and priorities.
                </li>
                <li className="hero-list-card rounded-[var(--flux-rad)] border px-3 py-2 text-sm">
                  Better collaboration with an organized flow and delivery focus.
                </li>
                <li className="hero-list-card rounded-[var(--flux-rad)] border px-3 py-2 text-sm">
                  The ideal structure for daily operations and future expansion.
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section id="funcionalidades" className="relative z-10 mt-10">
          <div className="mb-4">
            <h2 className="font-display text-2xl font-bold">Core features</h2>
            <p className="mt-2 text-sm text-[var(--flux-text-muted)]">
              Everything your team needs to execute better with clarity and a reliable operational standard.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {features.map((feature) => (
              <article
                key={feature.title}
                className="tone-card rounded-[var(--flux-rad-lg)] border bg-[var(--flux-surface-card)] p-5 shadow-[var(--shadow-md)]"
              >
                <h3 className="font-display text-lg font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm text-[var(--flux-text-muted)]">{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="relative z-10 mt-10 grid gap-4 md:grid-cols-2">
          <article className="tone-cyan rounded-[var(--flux-rad-lg)] border bg-[var(--flux-surface-card)] p-6">
            <h3 className="font-display text-xl font-semibold">Innovation opportunities with Flux-Board</h3>
            <ul className="mt-4 space-y-2 text-sm text-[var(--flux-text-muted)]">
              {innovations.map((item) => (
                <li key={item} className="rounded-[var(--flux-rad-sm)] border border-[rgba(255,255,255,0.09)] px-3 py-2">
                  {item}
                </li>
              ))}
            </ul>
          </article>

          <article className="tone-pink rounded-[var(--flux-rad-lg)] border bg-[var(--flux-surface-card)] p-6">
            <h3 className="font-display text-xl font-semibold">Practicality in daily execution</h3>
            <ul className="mt-4 space-y-2 text-sm text-[var(--flux-text-muted)]">
              {practicalItems.map((item) => (
                <li key={item} className="rounded-[var(--flux-rad-sm)] border border-[rgba(255,255,255,0.09)] px-3 py-2">
                  {item}
                </li>
              ))}
            </ul>
          </article>
        </section>

        <section className="tone-cta relative z-10 mt-10 rounded-[var(--flux-rad-xl)] border bg-[var(--flux-surface-card)] p-8 text-center">
          <h2 className="font-display text-2xl font-bold">Ready to transform your team operations?</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-[var(--flux-text-muted)]">
            Flux-Board is built for real commercial use: simple to adopt, consistent in daily work, and ready to evolve with your business growth.
          </p>
          <div className="mt-6 flex justify-center">
            <Link href="/login" className="btn-primary">
              Sign in and start delivering
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
