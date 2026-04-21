"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import type { ReleaseData, SprintData } from "@/lib/schemas";

type Props = {
  sprint: SprintData;
  boardName: string;
  release?: ReleaseData | null;
  /** Burndown rows for the mini-chart: date, ideal, actual. */
  burndown?: Array<{ date: string; ideal: number; actual: number }>;
};

/**
 * Sprint Command Center — painel de controle visual do sprint ativo.
 * Pensado para dar ao usuário uma leitura instantânea do pulso da sprint,
 * com métricas críticas, sinais de risco, vínculo à release atual e CTAs
 * para ações da cadência (planning / standup / review / retro) e release.
 */
export function SprintCommandCenter({ sprint, boardName, release, burndown = [] }: Props) {
  const t = useTranslations("sprints.commandCenter");
  const tCommon = useTranslations("sprints");
  const locale = useLocale();
  const localeRoot = `/${locale}`;

  const scopeTotal = sprint.cardIds.length;
  const doneTotal = sprint.doneCardIds.length;
  const addedMid = sprint.addedMidSprint.length;
  const removed = sprint.removedCardIds.length;
  const commitmentRatio = scopeTotal > 0 ? doneTotal / scopeTotal : 0;
  const scopeDrift = scopeTotal > 0 ? (addedMid + removed) / scopeTotal : 0;

  const daysElapsed = useMemo(() => {
    if (!sprint.startDate) return 0;
    const start = new Date(sprint.startDate).getTime();
    const now = Date.now();
    return Math.max(0, Math.floor((now - start) / (1000 * 60 * 60 * 24)));
  }, [sprint.startDate]);

  const daysTotal = useMemo(() => {
    if (!sprint.startDate || !sprint.endDate) return 0;
    const start = new Date(sprint.startDate).getTime();
    const end = new Date(sprint.endDate).getTime();
    return Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));
  }, [sprint.startDate, sprint.endDate]);

  const daysLeft = Math.max(0, daysTotal - daysElapsed);
  const timeProgress = daysTotal > 0 ? Math.min(1, daysElapsed / daysTotal) : 0;

  const signals = useMemo(() => computeSignals({ commitmentRatio, scopeDrift, timeProgress, daysLeft }), [
    commitmentRatio,
    scopeDrift,
    timeProgress,
    daysLeft,
  ]);

  const pulseTone = signals.level === "danger" ? "danger" : signals.level === "warning" ? "warning" : "success";

  return (
    <section
      aria-label={t("aria")}
      className="relative overflow-hidden rounded-[var(--flux-rad-lg)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] p-5 shadow-flux-md"
    >
      <PulseGradient tone={pulseTone} />

      <header className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusDot tone={pulseTone} />
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--flux-text-muted)]">
              {t("pretitle")}
            </span>
          </div>
          <h2 className="mt-1 font-display text-2xl font-bold leading-tight text-[var(--flux-text)]">
            {sprint.name}
          </h2>
          <p className="mt-1 truncate text-sm text-[var(--flux-text-muted)]">
            {boardName}
            {sprint.startDate && sprint.endDate ? ` · ${sprint.startDate} → ${sprint.endDate}` : null}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <HealthBadge ratio={commitmentRatio} label={t("health")} />
          {sprint.cadenceType === "continuous" ? (
            <span className="rounded-full bg-[var(--flux-info-alpha-10)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-info)]">
              {tCommon("detail.cadenceContinuous")}
            </span>
          ) : (
            <span className="rounded-full bg-[var(--flux-primary-alpha-12)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-primary-light)]">
              {tCommon("detail.cadenceTimebox")}
            </span>
          )}
        </div>
      </header>

      <div className="relative z-10 mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label={t("metrics.commitment")}
          value={`${Math.round(commitmentRatio * 100)}%`}
          caption={`${doneTotal}/${scopeTotal}`}
          progress={commitmentRatio}
          tone="primary"
        />
        <Metric
          label={t("metrics.timeLeft")}
          value={`${daysLeft}d`}
          caption={t("metrics.timeLeftCaption", { total: daysTotal })}
          progress={timeProgress}
          tone={daysLeft <= 1 ? "danger" : daysLeft <= 3 ? "warning" : "info"}
        />
        <Metric
          label={t("metrics.scopeDrift")}
          value={`${Math.round(scopeDrift * 100)}%`}
          caption={t("metrics.scopeDriftCaption", { added: addedMid, removed })}
          progress={Math.min(1, scopeDrift)}
          tone={scopeDrift > 0.25 ? "danger" : scopeDrift > 0.1 ? "warning" : "success"}
        />
        <Metric
          label={t("metrics.velocity")}
          value={sprint.velocity != null ? String(Math.round(sprint.velocity * 100) / 100) : "—"}
          caption={
            sprint.plannedCapacity != null
              ? t("metrics.velocityCaption", { capacity: sprint.plannedCapacity })
              : t("metrics.velocityCaptionEmpty")
          }
          progress={
            sprint.plannedCapacity && sprint.plannedCapacity > 0
              ? Math.min(1, (sprint.velocity ?? 0) / sprint.plannedCapacity)
              : 0
          }
          tone="accent"
        />
      </div>

      {burndown.length > 1 ? (
        <div className="relative z-10 mt-5 rounded-[var(--flux-rad-md)] border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-card)] p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
              {t("burndown.title")}
            </span>
            <span className="text-[10px] text-[var(--flux-text-muted)]">
              {t("burndown.legend")}
            </span>
          </div>
          <MiniBurndown rows={burndown} />
        </div>
      ) : null}

      {signals.items.length > 0 ? (
        <div className="relative z-10 mt-5 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
            {t("signals.title")}
          </p>
          <ul className="space-y-1.5">
            {signals.items.map((s, i) => (
              <li
                key={i}
                className={`flex items-start gap-2 rounded-[var(--flux-rad-sm)] border px-3 py-2 text-xs ${
                  s.severity === "danger"
                    ? "border-[var(--flux-danger-alpha-22)] bg-[var(--flux-danger-alpha-10)] text-[var(--flux-danger)]"
                    : s.severity === "warning"
                      ? "border-[var(--flux-warning-alpha-22)] bg-[var(--flux-warning-alpha-08)] text-[var(--flux-warning)]"
                      : "border-[var(--flux-success-alpha-22)] bg-[var(--flux-success-alpha-08)] text-[var(--flux-success)]"
                }`}
              >
                <span aria-hidden>●</span>
                <span className="text-[var(--flux-text)]">{t(`signals.msg.${s.key}`)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="relative z-10 mt-5 flex flex-col gap-3 border-t border-[var(--flux-chrome-alpha-08)] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <ReleasePill release={release ?? null} emptyLabel={t("release.empty")} />
          <Link
            href={`${localeRoot}/board/${encodeURIComponent(sprint.boardId)}/releases`}
            className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-25)] bg-[var(--flux-primary-alpha-08)] px-2.5 py-1 text-[11px] font-semibold text-[var(--flux-primary-light)] hover:bg-[var(--flux-primary-alpha-18)]"
          >
            {t("release.manage")}
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`${localeRoot}/sprints/${encodeURIComponent(sprint.boardId)}/${encodeURIComponent(sprint.id)}`}
            className="rounded-[var(--flux-rad-sm)] bg-[var(--flux-primary)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95"
          >
            {t("actions.openDetail")}
          </Link>
          <Link
            href={`${localeRoot}/board/${encodeURIComponent(sprint.boardId)}`}
            className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] px-3 py-1.5 text-xs font-semibold text-[var(--flux-text)] hover:bg-[var(--flux-chrome-alpha-06)]"
          >
            {t("actions.openBoard")}
          </Link>
        </div>
      </div>
    </section>
  );
}

function PulseGradient({ tone }: { tone: "success" | "warning" | "danger" }) {
  const color =
    tone === "danger"
      ? "var(--flux-danger)"
      : tone === "warning"
        ? "var(--flux-warning)"
        : "var(--flux-primary)";
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-[0.22]"
      style={{
        background: `radial-gradient(circle at 10% 0%, ${color}, transparent 48%), radial-gradient(circle at 95% 105%, ${color}, transparent 55%)`,
      }}
    />
  );
}

function StatusDot({ tone }: { tone: "success" | "warning" | "danger" }) {
  const bg =
    tone === "danger"
      ? "var(--flux-danger)"
      : tone === "warning"
        ? "var(--flux-warning)"
        : "var(--flux-success)";
  return (
    <span className="relative inline-flex h-2 w-2">
      <span
        className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
        style={{ background: bg }}
      />
      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: bg }} />
    </span>
  );
}

function HealthBadge({ ratio, label }: { ratio: number; label: string }) {
  const pct = Math.round(ratio * 100);
  const tone = pct >= 80 ? "success" : pct >= 50 ? "info" : "warning";
  const color =
    tone === "success"
      ? "var(--flux-success)"
      : tone === "info"
        ? "var(--flux-info)"
        : "var(--flux-warning)";
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1"
      style={{ borderColor: color, color }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.2" />
        <path
          d="M3 12a9 9 0 0 1 9-9"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          style={{ transform: `rotate(${pct * 3.6}deg)`, transformOrigin: "center" }}
        />
      </svg>
      <span className="text-[11px] font-bold uppercase tracking-wide">{label}</span>
      <span className="text-[13px] font-extrabold">{pct}</span>
    </div>
  );
}

type MetricTone = "primary" | "info" | "success" | "warning" | "danger" | "accent";

function Metric({
  label,
  value,
  caption,
  progress,
  tone,
}: {
  label: string;
  value: string;
  caption: string;
  progress: number;
  tone: MetricTone;
}) {
  const toneVar =
    tone === "primary"
      ? "var(--flux-primary)"
      : tone === "info"
        ? "var(--flux-info)"
        : tone === "success"
          ? "var(--flux-success)"
          : tone === "warning"
            ? "var(--flux-warning)"
            : tone === "danger"
              ? "var(--flux-danger)"
              : "var(--flux-accent)";
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  return (
    <div className="rounded-[var(--flux-rad-md)] border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-card)] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--flux-text-muted)]">
        {label}
      </p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-display text-xl font-bold text-[var(--flux-text)]">{value}</span>
        <span className="text-[11px] text-[var(--flux-text-muted)]">{caption}</span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full"
        style={{ background: "color-mix(in srgb, currentColor 10%, transparent)" }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, background: toneVar }}
        />
      </div>
    </div>
  );
}

function MiniBurndown({ rows }: { rows: Array<{ date: string; ideal: number; actual: number }> }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.ideal, r.actual)));
  const w = 100;
  const h = 36;
  const path = (key: "ideal" | "actual") =>
    rows
      .map((r, i) => {
        const x = (i / (rows.length - 1)) * w;
        const y = h - (r[key] / max) * h;
        return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-2 h-14 w-full">
      <defs>
        <linearGradient id="miniBurn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--flux-primary)" stopOpacity="0.45" />
          <stop offset="100%" stopColor="var(--flux-primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path("actual")} L${w},${h} L0,${h} Z`} fill="url(#miniBurn)" />
      <path d={path("ideal")} stroke="var(--flux-text-muted)" strokeWidth="1" fill="none" strokeDasharray="2 2" />
      <path d={path("actual")} stroke="var(--flux-primary)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function ReleasePill({ release, emptyLabel }: { release: ReleaseData | null; emptyLabel: string }) {
  if (!release) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--flux-chrome-alpha-18)] px-2.5 py-1 text-[11px] text-[var(--flux-text-muted)]">
        <ReleaseIcon /> {emptyLabel}
      </span>
    );
  }
  const tone =
    release.status === "released"
      ? "var(--flux-success)"
      : release.status === "staging"
        ? "var(--flux-info)"
        : release.status === "in_review"
          ? "var(--flux-warning)"
          : release.status === "rolled_back"
            ? "var(--flux-danger)"
            : "var(--flux-primary)";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
      style={{ borderColor: tone, color: tone }}
    >
      <ReleaseIcon />
      v{release.version} · {release.status}
    </span>
  );
}

function ReleaseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M14 3h7v7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 14 21 3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 14v7H3V3h7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type SignalKey =
  | "burningTooFast"
  | "lowCommitment"
  | "scopeDriftHigh"
  | "runningOutOfTime"
  | "onTrack"
  | "earlyDays";

function computeSignals(opts: {
  commitmentRatio: number;
  scopeDrift: number;
  timeProgress: number;
  daysLeft: number;
}): { level: "success" | "warning" | "danger"; items: Array<{ key: SignalKey; severity: "success" | "warning" | "danger" }> } {
  const items: Array<{ key: SignalKey; severity: "success" | "warning" | "danger" }> = [];
  let level: "success" | "warning" | "danger" = "success";

  if (opts.scopeDrift > 0.25) {
    items.push({ key: "scopeDriftHigh", severity: "danger" });
    level = "danger";
  } else if (opts.scopeDrift > 0.1) {
    items.push({ key: "scopeDriftHigh", severity: "warning" });
    if (level !== "danger") level = "warning";
  }

  if (opts.timeProgress > 0.65 && opts.commitmentRatio < 0.4) {
    items.push({ key: "lowCommitment", severity: "danger" });
    level = "danger";
  } else if (opts.timeProgress > 0.4 && opts.commitmentRatio < 0.25) {
    items.push({ key: "lowCommitment", severity: "warning" });
    if (level !== "danger") level = "warning";
  }

  if (opts.daysLeft <= 1 && opts.commitmentRatio < 0.85) {
    items.push({ key: "runningOutOfTime", severity: "danger" });
    level = "danger";
  }

  if (opts.commitmentRatio > opts.timeProgress + 0.1 && items.length === 0) {
    items.push({ key: "burningTooFast", severity: "success" });
  }

  if (items.length === 0) {
    if (opts.timeProgress < 0.2) items.push({ key: "earlyDays", severity: "success" });
    else items.push({ key: "onTrack", severity: "success" });
  }

  return { level, items };
}
