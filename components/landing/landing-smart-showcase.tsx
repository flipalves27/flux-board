"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { LandingMagnetCard } from "./landing-magnet-card";

/**
 * LandingSmartShowcase — seção com três "vitrines vivas" das capacidades
 * do produto, cada uma respondendo a interações reais ou em auto-demo:
 *
 *  1. Fluxy Command — command palette que digita sozinha consultas reais
 *     ("show boards at risk", "summarize sprint 42"…). Pausa quando o usuário
 *     interage com o input (aria-live off-screen apropriado).
 *  2. Flow Animation — mock de Kanban onde cards cruzam colunas sozinhos,
 *     mostrando throughput visual. Sincronizado com IntersectionObserver
 *     (só anima quando visível).
 *  3. Pulse Metrics — trio de cards com pulse reativo: score sobe/desce,
 *     sparkline atualiza, e pulse dot segue o estado.
 *
 * Cada cartão está envolto em LandingMagnetCard para tilt 3D reativo ao cursor.
 */

type ShowcaseCopy = {
  sectionBadge: string;
  heading: string;
  description: string;
  command: {
    title: string;
    description: string;
    placeholder: string;
    samples: string[];
    hint: string;
  };
  flow: {
    title: string;
    description: string;
    columns: { backlog: string; inProgress: string; done: string };
    cards: string[];
    live: string;
  };
  pulse: {
    title: string;
    description: string;
    labels: { score: string; trend: string; health: string };
    states: { live: string; stable: string; caution: string };
  };
};

export function LandingSmartShowcase() {
  const t = useTranslations("landing.smartShowcase");

  const copy: ShowcaseCopy = {
    sectionBadge: t("sectionBadge"),
    heading: t("heading"),
    description: t("description"),
    command: {
      title: t("command.title"),
      description: t("command.description"),
      placeholder: t("command.placeholder"),
      samples: [
        t("command.samples.0"),
        t("command.samples.1"),
        t("command.samples.2"),
        t("command.samples.3"),
      ],
      hint: t("command.hint"),
    },
    flow: {
      title: t("flow.title"),
      description: t("flow.description"),
      columns: {
        backlog: t("flow.columns.backlog"),
        inProgress: t("flow.columns.inProgress"),
        done: t("flow.columns.done"),
      },
      cards: [
        t("flow.cards.0"),
        t("flow.cards.1"),
        t("flow.cards.2"),
        t("flow.cards.3"),
        t("flow.cards.4"),
      ],
      live: t("flow.live"),
    },
    pulse: {
      title: t("pulse.title"),
      description: t("pulse.description"),
      labels: {
        score: t("pulse.labels.score"),
        trend: t("pulse.labels.trend"),
        health: t("pulse.labels.health"),
      },
      states: {
        live: t("pulse.states.live"),
        stable: t("pulse.states.stable"),
        caution: t("pulse.states.caution"),
      },
    },
  };

  return (
    <section
      id="smart-interactions"
      className="home-landing-reveal scroll-mt-24 py-14 md:scroll-mt-28 md:py-16"
      aria-labelledby="landing-smart-heading"
    >
      <p className="landing-section-badge">{copy.sectionBadge}</p>
      <div className="mb-10 max-w-2xl md:mb-12">
        <h2
          id="landing-smart-heading"
          className="font-display text-[clamp(1.75rem,3.4vw,2.7rem)] font-bold leading-[1.1] tracking-[-0.025em]"
        >
          {copy.heading}
        </h2>
        <p className="mt-3 max-w-[560px] text-[15px] leading-[1.75] text-[var(--flux-text-muted)]">
          {copy.description}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <LandingMagnetCard intensity={6} glow={0.6}>
          <CommandShowcase copy={copy.command} />
        </LandingMagnetCard>
        <LandingMagnetCard intensity={6} glow={0.55}>
          <FlowShowcase copy={copy.flow} />
        </LandingMagnetCard>
        <LandingMagnetCard intensity={6} glow={0.5}>
          <PulseShowcase copy={copy.pulse} />
        </LandingMagnetCard>
      </div>
    </section>
  );
}

/* ============================================================ */
/* Showcase 1: Command palette auto-demoing                     */
/* ============================================================ */

function CommandShowcase({ copy }: { copy: ShowcaseCopy["command"] }) {
  const [typed, setTyped] = useState("");
  const [sampleIdx, setSampleIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inView = useInView(rootRef);

  useEffect(() => {
    if (!inView || paused) return;

    let cancelled = false;
    const sample = copy.samples[sampleIdx] ?? "";
    let i = 0;

    const typeNext = () => {
      if (cancelled) return;
      if (i <= sample.length) {
        setTyped(sample.slice(0, i));
        i += 1;
        const jitter = 36 + Math.random() * 38;
        timers.push(setTimeout(typeNext, jitter));
      } else {
        timers.push(
          setTimeout(() => {
            if (cancelled) return;
            setSampleIdx((prev) => (prev + 1) % copy.samples.length);
            setTyped("");
          }, 1800)
        );
      }
    };

    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(typeNext, 260));

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [inView, paused, sampleIdx, copy.samples]);

  return (
    <div
      ref={rootRef}
      className="landing-showcase-card relative h-full overflow-hidden rounded-[18px] border border-[var(--flux-primary-alpha-18)] bg-[color-mix(in_srgb,var(--flux-surface-card)_88%,transparent)] p-5 backdrop-blur-[14px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--flux-primary-light)]">
          <span
            aria-hidden="true"
            className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-10)] text-[10px]"
          >
            ⌘K
          </span>
          {copy.title}
        </div>
        <span className="rounded-full bg-[var(--flux-success-alpha-12)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--flux-success)]">
          AI
        </span>
      </div>
      <p className="mb-4 text-[12.5px] leading-relaxed text-[var(--flux-text-muted)]">
        {copy.description}
      </p>
      <div
        className="flex items-center gap-2 rounded-[12px] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-dark)]/60 px-3 py-2.5"
        role="presentation"
      >
        <span className="text-[var(--flux-primary-light)]" aria-hidden="true">
          ❯
        </span>
        <span
          className="flex-1 truncate font-mono text-[13px] text-[var(--flux-text)]"
          aria-live="polite"
        >
          {typed || <span className="text-[var(--flux-text-muted)]">{copy.placeholder}</span>}
          <span className="landing-showcase-caret ml-[1px] inline-block align-middle" aria-hidden="true" />
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {copy.samples.slice(0, 3).map((s, idx) => (
          <button
            key={s}
            type="button"
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
              idx === sampleIdx
                ? "border-[var(--flux-primary-alpha-55)] bg-[var(--flux-primary-alpha-15)] text-[var(--flux-primary-light)]"
                : "border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
            }`}
            onClick={() => {
              setSampleIdx(idx);
              setTyped("");
            }}
          >
            {s.slice(0, 28)}
            {s.length > 28 ? "…" : ""}
          </button>
        ))}
      </div>
      <p className="mt-4 text-[10.5px] leading-relaxed text-[var(--flux-text-muted)]/80">
        {copy.hint}
      </p>
    </div>
  );
}

/* ============================================================ */
/* Showcase 2: Flow animation (cards moving through columns)    */
/* ============================================================ */

type FlowCard = {
  id: string;
  label: string;
  /** Coluna lógica (0=backlog, 1=inProgress, 2=done). */
  col: number;
  /** Cor do indicador. */
  tone: "primary" | "secondary" | "accent" | "success";
};

const FLOW_TICK_MS = 2200;

function FlowShowcase({ copy }: { copy: ShowcaseCopy["flow"] }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inView = useInView(rootRef);
  const tones: FlowCard["tone"][] = ["primary", "secondary", "accent", "success", "primary"];

  const initialCards = useMemo<FlowCard[]>(
    () =>
      copy.cards.map((label, i) => ({
        id: `c${i}`,
        label,
        col: i < 2 ? 0 : i < 4 ? 1 : 2,
        tone: tones[i % tones.length],
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [copy.cards.join("|")]
  );

  const [cards, setCards] = useState<FlowCard[]>(initialCards);

  useEffect(() => {
    setCards(initialCards);
  }, [initialCards]);

  useEffect(() => {
    if (!inView) return;

    const tick = () => {
      setCards((prev) => {
        // encontra o card "mais maduro" em cada coluna e promove um por ciclo
        const next = prev.map((c) => ({ ...c }));
        // promove o primeiro card que ainda não está em "done"
        const candidate = next.find((c) => c.col < 2);
        if (candidate) {
          candidate.col = Math.min(2, candidate.col + 1);
        } else {
          // reset suave quando tudo estiver em done
          return prev.map((c, idx) => ({ ...c, col: idx < 2 ? 0 : idx < 4 ? 1 : 2 }));
        }
        return next;
      });
    };

    const interval = setInterval(tick, FLOW_TICK_MS);
    return () => clearInterval(interval);
  }, [inView]);

  const columns = [
    { key: 0, label: copy.columns.backlog },
    { key: 1, label: copy.columns.inProgress },
    { key: 2, label: copy.columns.done },
  ];

  return (
    <div
      ref={rootRef}
      className="landing-showcase-card relative flex h-full flex-col overflow-hidden rounded-[18px] border border-[var(--flux-secondary-alpha-25)] bg-[color-mix(in_srgb,var(--flux-surface-card)_88%,transparent)] p-5 backdrop-blur-[14px]"
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--flux-secondary)]">
          <span
            aria-hidden="true"
            className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-[var(--flux-secondary-alpha-35)] bg-[var(--flux-secondary-alpha-10)] text-[10px]"
          >
            ⇄
          </span>
          {copy.title}
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--flux-success-alpha-12)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--flux-success)]">
          <span className="landing-showcase-live-dot" aria-hidden="true" />
          {copy.live}
        </span>
      </div>
      <p className="mb-4 text-[12.5px] leading-relaxed text-[var(--flux-text-muted)]">
        {copy.description}
      </p>
      <div className="grid flex-1 grid-cols-3 gap-2">
        {columns.map((col) => {
          const colCards = cards.filter((c) => c.col === col.key);
          return (
            <div
              key={col.key}
              className="min-h-[180px] rounded-[12px] border border-[var(--flux-chrome-alpha-08)] bg-[color-mix(in_srgb,var(--flux-surface-dark)_60%,transparent)] p-2"
            >
              <p className="mb-2 text-[9px] font-bold uppercase tracking-wide text-[var(--flux-text-muted)]">
                {col.label}
                <span className="ml-1 font-mono text-[var(--flux-primary-light)]">{colCards.length}</span>
              </p>
              <ul className="space-y-1.5">
                {colCards.map((c) => (
                  <li
                    key={c.id}
                    className="landing-showcase-flow-card rounded-[8px] border px-2 py-1.5 text-[10.5px] font-semibold leading-tight shadow-sm"
                    style={{
                      borderColor: `color-mix(in srgb, var(--flux-${c.tone}) 35%, transparent)`,
                      background: `color-mix(in srgb, var(--flux-${c.tone}) 14%, var(--flux-surface-card))`,
                      color: "var(--flux-text)",
                    }}
                  >
                    <span
                      className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle"
                      style={{ background: `var(--flux-${c.tone})` }}
                      aria-hidden="true"
                    />
                    {c.label}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================ */
/* Showcase 3: Pulse metrics                                    */
/* ============================================================ */

function PulseShowcase({ copy }: { copy: ShowcaseCopy["pulse"] }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inView = useInView(rootRef);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const id = setInterval(() => setTick((t) => (t + 1) % 3), 2600);
    return () => clearInterval(id);
  }, [inView]);

  const states = [
    { label: copy.states.live, tone: "success" as const, pct: 82, delta: 6 },
    { label: copy.states.stable, tone: "primary" as const, pct: 64, delta: 1 },
    { label: copy.states.caution, tone: "warning" as const, pct: 41, delta: -4 },
  ];
  const active = states[tick];

  return (
    <div
      ref={rootRef}
      className="landing-showcase-card relative flex h-full flex-col overflow-hidden rounded-[18px] border border-[var(--flux-accent-alpha-25)] bg-[color-mix(in_srgb,var(--flux-surface-card)_88%,transparent)] p-5 backdrop-blur-[14px]"
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--flux-accent)]">
          <span
            aria-hidden="true"
            className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-[var(--flux-accent-alpha-35)] bg-[color-mix(in_srgb,var(--flux-accent)_12%,transparent)] text-[10px]"
          >
            ♡
          </span>
          {copy.title}
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide"
          style={{
            background: `color-mix(in srgb, var(--flux-${active.tone}) 14%, transparent)`,
            color: `var(--flux-${active.tone})`,
          }}
        >
          {active.label}
        </span>
      </div>
      <p className="mb-4 text-[12.5px] leading-relaxed text-[var(--flux-text-muted)]">
        {copy.description}
      </p>
      <div className="mb-4 flex items-center gap-4">
        <div
          className="relative grid h-[72px] w-[72px] shrink-0 place-items-center rounded-full transition-[background] duration-700"
          style={{
            background: `conic-gradient(var(--flux-${active.tone}) ${active.pct}%, color-mix(in srgb, var(--flux-chrome) 12%, transparent) 0)`,
          }}
          aria-label={`${copy.labels.score}: ${active.pct}`}
          role="img"
        >
          <div
            className="grid h-[58px] w-[58px] place-items-center rounded-full bg-[var(--flux-surface-card)]"
            style={{
              boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--flux-chrome) 10%, transparent)",
            }}
          >
            <div className="flex flex-col items-center leading-tight">
              <span className="font-display text-[16px] font-bold tabular-nums">{active.pct}</span>
              <span className="text-[8.5px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
                {copy.labels.score}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
            {copy.labels.trend}
          </span>
          <span
            className="font-display text-lg font-bold tabular-nums"
            style={{ color: active.delta >= 0 ? "var(--flux-success)" : "var(--flux-danger)" }}
          >
            {active.delta >= 0 ? "▲" : "▼"} {Math.abs(active.delta)}
          </span>
          <div className="flex items-end gap-[3px] pt-1">
            {[36, 48, 62, 57, 70, 65, active.pct].map((v, i) => (
              <span
                key={i}
                className="inline-block w-[4px] rounded-sm"
                style={{
                  height: `${Math.max(4, (v / 100) * 28)}px`,
                  background: `color-mix(in srgb, var(--flux-${active.tone}) 75%, transparent)`,
                  transition: "height 560ms ease-out",
                }}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="mt-auto rounded-[10px] border border-[var(--flux-chrome-alpha-08)] bg-[color-mix(in_srgb,var(--flux-surface-elevated)_70%,transparent)] p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
          {copy.labels.health}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <span
            className="landing-showcase-pulse-dot"
            style={{ ["--pulse-color" as string]: `var(--flux-${active.tone})` }}
            aria-hidden="true"
          />
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--flux-chrome)_12%,transparent)]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${active.pct}%`,
                background: `linear-gradient(90deg, var(--flux-${active.tone}), color-mix(in srgb, var(--flux-${active.tone}) 60%, var(--flux-primary)))`,
                transition: "width 620ms ease-out",
              }}
            />
          </div>
          <span className="w-8 text-right font-mono text-[11px] tabular-nums">{active.pct}</span>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ */
/* Shared: useInView (IntersectionObserver helper)              */
/* ============================================================ */

function useInView(ref: React.RefObject<HTMLElement | null>, threshold = 0.25) {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          setInView(e.isIntersecting);
        }
      },
      { threshold }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, threshold]);

  return inView;
}
