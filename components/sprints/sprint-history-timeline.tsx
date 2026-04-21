"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import type { ReleaseData, SprintData } from "@/lib/schemas";

type Props = {
  boardId: string;
  boardName?: string;
  sprints: SprintData[];
  releases?: ReleaseData[];
};

/**
 * SprintHistoryTimeline — visualização horizontal, elegante e navegável
 * do histórico de sprints, com drill-down para cards vinculados. Cada
 * ponto da linha é um sprint; ramificações laterais marcam releases.
 */
export function SprintHistoryTimeline({ boardId, boardName, sprints, releases = [] }: Props) {
  const t = useTranslations("sprints.timeline");
  const locale = useLocale();
  const localeRoot = `/${locale}`;
  const [selectedId, setSelectedId] = useState<string | null>(sprints[0]?.id ?? null);

  const ordered = useMemo(
    () =>
      [...sprints].sort((a, b) => {
        const ae = a.endDate ? new Date(a.endDate).getTime() : new Date(a.updatedAt).getTime();
        const be = b.endDate ? new Date(b.endDate).getTime() : new Date(b.updatedAt).getTime();
        return ae - be;
      }),
    [sprints]
  );

  const selected = useMemo(
    () => sprints.find((s) => s.id === selectedId) ?? null,
    [selectedId, sprints]
  );

  const releasesBySprint = useMemo(() => {
    const m = new Map<string, ReleaseData[]>();
    for (const r of releases) {
      for (const sid of r.sprintIds) {
        const arr = m.get(sid) ?? [];
        arr.push(r);
        m.set(sid, arr);
      }
    }
    return m;
  }, [releases]);

  if (sprints.length === 0) {
    return (
      <div className="rounded-[var(--flux-rad-md)] border border-dashed border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] p-8 text-center">
        <p className="text-sm text-[var(--flux-text-muted)]">{t("empty")}</p>
      </div>
    );
  }

  const maxVelocity = Math.max(1, ...ordered.map((s) => s.velocity ?? 0));

  return (
    <section className="space-y-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-[var(--flux-text)]">
            {boardName ? `${t("title")} · ${boardName}` : t("title")}
          </h2>
          <p className="text-xs text-[var(--flux-text-muted)]">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-[var(--flux-text-muted)]">
          <LegendDot tone="primary" /> {t("legend.closed")}
          <LegendDot tone="info" /> {t("legend.review")}
          <LegendDot tone="success" /> {t("legend.active")}
          <LegendDot tone="accent" /> {t("legend.release")}
        </div>
      </header>

      <div className="rounded-[var(--flux-rad-lg)] border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-elevated)] p-4">
        <div className="relative overflow-x-auto pb-6">
          <div className="flex min-w-max items-end gap-6 pt-4">
            {ordered.map((sprint) => {
              const isSelected = selected?.id === sprint.id;
              const pct = sprint.velocity != null ? (sprint.velocity / maxVelocity) * 100 : 18;
              const statusTone =
                sprint.status === "active"
                  ? "success"
                  : sprint.status === "review"
                    ? "info"
                    : sprint.status === "closed"
                      ? "primary"
                      : "muted";
              const sprintReleases = releasesBySprint.get(sprint.id) ?? [];

              return (
                <button
                  type="button"
                  key={sprint.id}
                  onClick={() => setSelectedId(sprint.id)}
                  aria-pressed={isSelected}
                  className={`group flex min-w-[160px] max-w-[220px] flex-col items-stretch rounded-[var(--flux-rad-md)] border px-3 py-3 text-left transition-all ${
                    isSelected
                      ? "border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-08)] shadow-flux-md"
                      : "border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-card)] hover:border-[var(--flux-primary-alpha-22)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <LegendDot tone={statusTone} />
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
                        {t(`status.${sprint.status}`)}
                      </span>
                    </div>
                    {sprint.velocity != null ? (
                      <span className="rounded-full bg-[var(--flux-chrome-alpha-06)] px-2 py-0.5 text-[10px] font-semibold text-[var(--flux-text)]">
                        {Math.round(sprint.velocity * 100) / 100}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 line-clamp-2 font-display text-sm font-bold text-[var(--flux-text)]">
                    {sprint.name}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--flux-text-muted)]">
                    {sprint.endDate ?? sprint.startDate ?? "—"}
                  </p>
                  <div
                    className="mt-2 h-1 overflow-hidden rounded-full"
                    style={{ background: "color-mix(in srgb, currentColor 10%, transparent)" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(4, pct)}%`,
                        background:
                          statusTone === "primary"
                            ? "var(--flux-primary)"
                            : statusTone === "info"
                              ? "var(--flux-info)"
                              : statusTone === "success"
                                ? "var(--flux-success)"
                                : "var(--flux-chrome-alpha-18)",
                      }}
                    />
                  </div>
                  {sprintReleases.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {sprintReleases.slice(0, 3).map((r) => (
                        <span
                          key={r.id}
                          className="rounded-full bg-[var(--flux-accent-alpha-12)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--flux-accent)]"
                        >
                          v{r.version}
                        </span>
                      ))}
                      {sprintReleases.length > 3 ? (
                        <span className="rounded-full bg-[var(--flux-chrome-alpha-06)] px-1.5 py-0.5 text-[9px] text-[var(--flux-text-muted)]">
                          +{sprintReleases.length - 3}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-4 top-[46%] h-px"
            style={{
              background:
                "linear-gradient(to right, transparent, var(--flux-chrome-alpha-18) 12%, var(--flux-chrome-alpha-18) 88%, transparent)",
            }}
          />
        </div>

        {selected ? (
          <SprintDetailPanel
            sprint={selected}
            releases={releasesBySprint.get(selected.id) ?? []}
            boardId={boardId}
            localeRoot={localeRoot}
          />
        ) : null}
      </div>
    </section>
  );
}

function SprintDetailPanel({
  sprint,
  releases,
  boardId,
  localeRoot,
}: {
  sprint: SprintData;
  releases: ReleaseData[];
  boardId: string;
  localeRoot: string;
}) {
  const t = useTranslations("sprints.timeline");
  const scopedCards = sprint.scopeSnapshot?.cards ?? [];
  const hasSnapshot = Array.isArray(sprint.scopeSnapshot?.cards) && scopedCards.length > 0;
  const scopeTotal = sprint.cardIds.length;
  const doneTotal = sprint.doneCardIds.length;
  const commitmentPct = scopeTotal > 0 ? Math.round((doneTotal / scopeTotal) * 100) : 0;

  return (
    <div className="mt-4 grid gap-4 rounded-[var(--flux-rad-md)] border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-card)] p-4 md:grid-cols-[1fr_1.2fr]">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--flux-text-muted)]">
          {t("detail.title")}
        </p>
        <h3 className="font-display text-xl font-bold text-[var(--flux-text)]">{sprint.name}</h3>
        <p className="mt-1 text-xs text-[var(--flux-text-muted)]">
          {sprint.goal || t("detail.noGoal")}
        </p>

        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          <DlItem label={t("detail.commitment")} value={`${commitmentPct}%`} />
          <DlItem label={t("detail.scope")} value={String(scopeTotal)} />
          <DlItem label={t("detail.done")} value={String(doneTotal)} />
        </dl>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {sprint.sprintTags.slice(0, 8).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-[var(--flux-primary-alpha-08)] px-2 py-0.5 text-[10px] font-semibold text-[var(--flux-primary-light)]"
            >
              #{tag}
            </span>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`${localeRoot}/sprints/${encodeURIComponent(boardId)}/${encodeURIComponent(sprint.id)}`}
            className="rounded-[var(--flux-rad-sm)] bg-[var(--flux-primary)] px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-95"
          >
            {t("detail.open")}
          </Link>
          <Link
            href={`${localeRoot}/board/${encodeURIComponent(boardId)}/sprint-history`}
            className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] px-2.5 py-1 text-[11px] font-semibold text-[var(--flux-text)] hover:bg-[var(--flux-chrome-alpha-06)]"
          >
            {t("detail.fullHistory")}
          </Link>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--flux-text-muted)]">
            {t("detail.cardsTitle")}
          </p>
          {hasSnapshot ? (
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1">
              {scopedCards.slice(0, 12).map((card, i) => {
                const c = card as { id?: string; title?: string; bucket?: string } | null;
                const title = c?.title ?? c?.id ?? `#${i + 1}`;
                return (
                  <li
                    key={(c?.id ?? "") + i}
                    className="flex items-start gap-2 rounded-[var(--flux-rad-sm)] bg-[var(--flux-surface-elevated)] px-2 py-1.5 text-[12px]"
                  >
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--flux-primary)]" aria-hidden />
                    <span className="line-clamp-1 text-[var(--flux-text)]">{title}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-[var(--flux-text-muted)]">{t("detail.reconstructedHint")}</p>
          )}
        </div>

        {releases.length > 0 ? (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--flux-text-muted)]">
              {t("detail.releasesTitle")}
            </p>
            <ul className="mt-2 space-y-1.5">
              {releases.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-elevated)] px-2.5 py-1.5 text-[12px]"
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-[var(--flux-accent-alpha-12)] px-2 py-0.5 text-[10px] font-bold text-[var(--flux-accent)]">
                      v{r.version}
                    </span>
                    <span className="text-[var(--flux-text)]">{r.name}</span>
                  </div>
                  <span className="text-[10px] uppercase tracking-wide text-[var(--flux-text-muted)]">
                    {r.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DlItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--flux-rad-sm)] bg-[var(--flux-surface-elevated)] px-2 py-2">
      <dt className="text-[10px] uppercase tracking-wide text-[var(--flux-text-muted)]">{label}</dt>
      <dd className="font-display text-base font-bold text-[var(--flux-text)]">{value}</dd>
    </div>
  );
}

function LegendDot({ tone }: { tone: "primary" | "info" | "success" | "accent" | "muted" }) {
  const bg =
    tone === "primary"
      ? "var(--flux-primary)"
      : tone === "info"
        ? "var(--flux-info)"
        : tone === "success"
          ? "var(--flux-success)"
          : tone === "accent"
            ? "var(--flux-accent)"
            : "var(--flux-chrome-alpha-18)";
  return <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: bg }} />;
}
