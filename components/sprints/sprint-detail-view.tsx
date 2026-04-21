"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, apiGet, ApiError, getApiHeaders } from "@/lib/api-client";
import type { SprintData } from "@/lib/schemas";
import type { SprintOverviewPayload } from "@/lib/sprint-overview";
import { useCeremonyStore } from "@/stores/ceremony-store";
import { useWorkspaceFluxyDockStore } from "@/stores/workspace-fluxy-dock-store";
import { FeatureGateNotice } from "@/components/billing/feature-gate-notice";
import { Header } from "@/components/header";
import { FluxEmptyState } from "@/components/ui/flux-empty-state";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { SprintFormDrawer } from "@/components/sprints/sprint-form-drawer";
import { VelocityOraclePanel } from "@/components/sprints/velocity-oracle-panel";
import { AiRetrospectivePanel } from "@/components/sprints/ai-retrospective-panel";

type TabId = "overview" | "scope" | "metrics" | "history" | "ceremonies" | "oracle" | "retro";

type Props = {
  boardId: string;
  sprintId: string;
  getHeaders: () => Record<string, string>;
};

export function SprintDetailView({ boardId, sprintId, getHeaders }: Props) {
  const locale = useLocale();
  const localeRoot = `/${locale}`;
  const router = useRouter();
  const t = useTranslations("sprints.detail");
  const tc = useTranslations("sprints");
  const setSprintContext = useWorkspaceFluxyDockStore((s) => s.setSprintContext);
  const openPlanning = useCeremonyStore((s) => s.openPlanning);
  const openStandup = useCeremonyStore((s) => s.openStandup);
  const openReview = useCeremonyStore((s) => s.openReview);
  const openRetro = useCeremonyStore((s) => s.openRetro);

  const [tab, setTab] = useState<TabId>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<SprintOverviewPayload | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<SprintOverviewPayload>(
        `/api/boards/${encodeURIComponent(boardId)}/sprints/${encodeURIComponent(sprintId)}/overview`,
        getHeaders()
      );
      setOverview(data);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 402 || e.status === 403)) {
        setError("upgrade");
      } else if (e instanceof ApiError && e.status === 404) {
        setError("notfound");
      } else {
        setError("load");
      }
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }, [boardId, sprintId, getHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSprintContext({ boardId, sprintId });
    return () => setSprintContext(null);
  }, [boardId, sprintId, setSprintContext]);

  const sprint = overview?.sprint;
  const chartData = useMemo(() => {
    const days = overview?.burndown?.days ?? [];
    return days.map((d) => ({ date: d.date, ideal: d.ideal, actual: d.actual }));
  }, [overview?.burndown?.days]);

  const askAi = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setAiLoading(true);
    setAiAnswer(null);
    try {
      const res = await apiFetch(
        `/api/boards/${encodeURIComponent(boardId)}/sprints/${encodeURIComponent(sprintId)}/history-ai`,
        {
          method: "POST",
          headers: { ...getApiHeaders(getHeaders()), "Content-Type": "application/json" },
          body: JSON.stringify({ question: trimmed }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as { answer?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "IA");
      setAiAnswer(data.answer ?? "");
    } catch {
      setAiAnswer(t("aiError"));
    } finally {
      setAiLoading(false);
    }
  };

  const deleteSprint = async () => {
    if (!sprint) return;
    if (!window.confirm(t("confirmDelete"))) return;
    const res = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}/sprints/${encodeURIComponent(sprintId)}`, {
      method: "DELETE",
      headers: getApiHeaders(getHeaders()),
    });
    if (res.ok) router.push(`${localeRoot}/sprints`);
  };

  if (loading) {
    return (
      <>
        <Header />
        <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-[var(--flux-text-muted)]">{t("loading")}</div>
      </>
    );
  }

  if (error === "upgrade") {
    return (
      <>
        <Header />
        <div className="mx-auto max-w-5xl px-4 py-8">
          <FeatureGateNotice
            title={tc("upgradeTitle")}
            description={tc("upgradeRequired")}
            ctaLabel={tc("upgradeCta")}
            ctaHref={`${localeRoot}/billing`}
          />
        </div>
      </>
    );
  }

  if (error === "load") {
    return (
      <>
        <Header />
        <div className="mx-auto max-w-5xl px-4 py-10 space-y-4">
          <FluxEmptyState title={t("tabs.overview")} description={t("loadError")} />
          <button type="button" className="text-sm font-semibold text-[var(--flux-primary-light)] hover:underline" onClick={() => void load()}>
            {t("retry")}
          </button>
        </div>
      </>
    );
  }

  if (error === "notfound" || !overview || !sprint) {
    return (
      <>
        <Header />
        <div className="mx-auto max-w-5xl px-4 py-10 space-y-4">
          <FluxEmptyState title={t("tabs.overview")} description={t("notFound")} />
          <Link href={`${localeRoot}/sprints`} className="text-sm font-semibold text-[var(--flux-primary-light)] hover:underline">
            {t("backHub")}
          </Link>
        </div>
      </>
    );
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: "overview", label: t("tabs.overview") },
    { id: "scope", label: t("tabs.scope") },
    { id: "metrics", label: t("tabs.metrics") },
    { id: "history", label: t("tabs.history") },
    { id: "ceremonies", label: t("tabs.ceremonies") },
    { id: "oracle", label: "⟁ Oracle" },
    { id: "retro", label: "◈ Retro IA" },
  ];

  return (
    <>
      <Header />
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link href={`${localeRoot}/sprints`} className="text-xs font-semibold text-[var(--flux-primary-light)] hover:underline">
              ← {t("backHub")}
            </Link>
            <h1 className="mt-2 font-display text-2xl font-bold text-[var(--flux-text)]">{sprint.name}</h1>
            <p className="mt-1 text-sm text-[var(--flux-text-muted)]">
              <Link href={`${localeRoot}/board/${encodeURIComponent(boardId)}`} className="hover:underline">
                {overview.boardName}
              </Link>
              {sprint.startDate && sprint.endDate ? ` · ${sprint.startDate} → ${sprint.endDate}` : null}
            </p>
            <p className="mt-2 text-xs text-[var(--flux-text-muted)]">
              {tc(`status.${sprint.status}`)} · {sprint.cadenceType === "continuous" ? t("cadenceContinuous") : t("cadenceTimebox")}
            </p>
            {sprint.status === "closed" && !sprint.scopeSnapshot ? (
              <p className="mt-2 rounded-lg border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-chrome-alpha-04)] px-3 py-2 text-[11px] text-[var(--flux-text-muted)]">
                {t("reconstructedHint")}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`${localeRoot}/sprints/${encodeURIComponent(boardId)}/${encodeURIComponent(sprintId)}/command-center`}
              className="rounded-lg border border-[var(--flux-primary-alpha-25)] bg-[var(--flux-primary-alpha-08)] px-3 py-2 text-xs font-semibold text-[var(--flux-primary-light)] hover:bg-[var(--flux-primary-alpha-18)]"
            >
              ✦ {tc("commandCenter.pretitle")}
            </Link>
            <Link
              href={`${localeRoot}/board/${encodeURIComponent(boardId)}/releases`}
              className="rounded-lg border border-[var(--flux-chrome-alpha-12)] px-3 py-2 text-xs font-semibold text-[var(--flux-text)] hover:bg-[var(--flux-chrome-alpha-06)]"
            >
              ⏱ Releases
            </Link>
            <button type="button" className="btn-primary px-3 py-2 text-xs" onClick={() => setDrawerOpen(true)}>
              {t("edit")}
            </button>
            <Link
              href={`${localeRoot}/board/${encodeURIComponent(boardId)}`}
              className="rounded-lg border border-[var(--flux-chrome-alpha-12)] px-3 py-2 text-xs font-semibold text-[var(--flux-text)] hover:bg-[var(--flux-chrome-alpha-06)]"
            >
              {tc("openBoard")}
            </Link>
            <button
              type="button"
              className="rounded-lg border border-[var(--flux-warning-alpha-35)] px-3 py-2 text-xs font-semibold text-[var(--flux-warning)] hover:bg-[var(--flux-warning-alpha-08)]"
              onClick={() => void deleteSprint()}
            >
              {t("delete")}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1 border-b border-[var(--flux-chrome-alpha-08)] pb-px">
          {tabs.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setTab(x.id)}
              className={`rounded-t-lg px-3 py-2 text-xs font-semibold transition-colors ${
                tab === x.id
                  ? "bg-[var(--flux-primary-alpha-12)] text-[var(--flux-primary-light)]"
                  : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
              }`}
            >
              {x.label}
            </button>
          ))}
        </div>

        {tab === "overview" ? (
          <section className="space-y-4 rounded-2xl border border-[var(--flux-chrome-alpha-08)] p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">{t("goalTitle")}</h2>
            <p className="text-sm text-[var(--flux-text)] whitespace-pre-wrap">{sprint.goal || t("noGoal")}</p>
            {sprint.commitmentNote ? (
              <>
                <h3 className="text-xs font-semibold text-[var(--flux-text-muted)]">{t("commitmentNote")}</h3>
                <p className="text-sm text-[var(--flux-text)]">{sprint.commitmentNote}</p>
              </>
            ) : null}
            <dl className="grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <dt className="text-[var(--flux-text-muted)]">{t("plannedCapacity")}</dt>
                <dd className="font-medium text-[var(--flux-text)]">{sprint.plannedCapacity ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[var(--flux-text-muted)]">{t("velocity")}</dt>
                <dd className="font-medium text-[var(--flux-text)]">{sprint.velocity ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[var(--flux-text-muted)]">{t("programIncrement")}</dt>
                <dd className="font-medium text-[var(--flux-text)]">{sprint.programIncrementId ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[var(--flux-text-muted)]">{t("tags")}</dt>
                <dd className="font-medium text-[var(--flux-text)]">
                  {sprint.sprintTags.length ? sprint.sprintTags.join(", ") : "—"}
                </dd>
              </div>
            </dl>
            {sprint.wipPolicyNote ? (
              <div>
                <h3 className="text-xs font-semibold text-[var(--flux-text-muted)]">{t("wipPolicy")}</h3>
                <p className="text-sm text-[var(--flux-text)]">{sprint.wipPolicyNote}</p>
              </div>
            ) : null}
          </section>
        ) : null}

        {tab === "scope" ? (
          <section className="space-y-6">
            <CardList
              title={t("scopeTitle")}
              cards={overview.cardsScope}
              empty={t("emptyScope")}
              localeRoot={localeRoot}
              boardId={boardId}
              openBoardLabel={tc("openBoard")}
              missingCardLabel={t("cardMissing")}
            />
            <CardList
              title={t("doneTitle")}
              cards={overview.cardsDone}
              empty={t("emptyDone")}
              localeRoot={localeRoot}
              boardId={boardId}
              openBoardLabel={tc("openBoard")}
              missingCardLabel={t("cardMissing")}
            />
            <CardList
              title={t("addedMidTitle")}
              cards={overview.cardsAddedMid}
              empty={t("emptyAddedMid")}
              localeRoot={localeRoot}
              boardId={boardId}
              openBoardLabel={tc("openBoard")}
              missingCardLabel={t("cardMissing")}
            />
            <CardList
              title={t("removedTitle")}
              cards={overview.cardsRemoved}
              empty={t("emptyRemoved")}
              localeRoot={localeRoot}
              boardId={boardId}
              openBoardLabel={tc("openBoard")}
              missingCardLabel={t("cardMissing")}
            />
          </section>
        ) : null}

        {tab === "metrics" ? (
          <section className="space-y-4">
            {!chartData.length ? (
              <FluxEmptyState title={t("tabs.metrics")} description={t("noBurndown")} />
            ) : (
              <div className="h-64 w-full rounded-xl border border-[var(--flux-chrome-alpha-08)] p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="var(--flux-text-muted)" />
                    <YAxis tick={{ fontSize: 10 }} stroke="var(--flux-text-muted)" allowDecimals />
                    <Tooltip
                      contentStyle={{
                        background: "var(--flux-surface-card)",
                        border: "1px solid var(--flux-chrome-alpha-12)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Line type="monotone" dataKey="ideal" stroke="var(--flux-text-muted)" dot={false} name={t("ideal")} />
                    <Line type="monotone" dataKey="actual" stroke="var(--flux-primary)" dot={false} name={t("actual")} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
        ) : null}

        {tab === "history" ? (
          <section className="space-y-6">
            <div className="rounded-2xl border border-[var(--flux-chrome-alpha-08)] p-5 space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">{t("timelineTitle")}</h2>
              <ul className="space-y-2 text-sm text-[var(--flux-text)]">
                {overview.timeline.length === 0 ? (
                  <li className="text-[var(--flux-text-muted)]">{t("emptyTimeline")}</li>
                ) : (
                  overview.timeline.map((item, i) => (
                    <li key={i} className="border-l-2 border-[var(--flux-primary-alpha-25)] pl-3">
                      {item.kind === "milestone"
                        ? item.event === "sprint_created"
                          ? t("timeline.created")
                          : item.event
                        : item.kind === "burndown_snapshot"
                          ? t("timeline.burndown", {
                              date: item.snapshot.date,
                              n: item.snapshot.remainingCards,
                            })
                          : item.kind === "scope_batch"
                            ? item.variant === "added_mid_sprint"
                              ? t("timeline.addedMid", { count: item.cardIds.length })
                              : item.variant === "removed"
                                ? t("timeline.removed", { count: item.cardIds.length })
                                : t("timeline.done", { count: item.cardIds.length })
                            : t("timeline.column", { title: item.title, col: item.bucketLabel })}
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div className="rounded-2xl border border-[var(--flux-primary-alpha-22)] bg-[var(--flux-primary-alpha-06)] p-5 space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--flux-primary-light)]">{t("aiTitle")}</h2>
              <p className="text-xs text-[var(--flux-text-muted)]">{t("aiHint")}</p>
              <div className="flex flex-wrap gap-2">
                {(["q1", "q2", "q3"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    className="rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-2 py-1 text-[11px] font-semibold text-[var(--flux-text)] hover:border-[var(--flux-primary-alpha-35)]"
                    onClick={() => {
                      setAiQuestion(t(`aiSuggestions.${k}`));
                      void askAi(t(`aiSuggestions.${k}`));
                    }}
                  >
                    {t(`aiSuggestions.${k}`)}
                  </button>
                ))}
              </div>
              <textarea
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                rows={2}
                placeholder={t("aiPlaceholder")}
                className="w-full rounded-xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-mid)] px-3 py-2 text-sm text-[var(--flux-text)]"
              />
              <button
                type="button"
                className="btn-primary px-3 py-2 text-xs"
                disabled={aiLoading || !aiQuestion.trim()}
                onClick={() => void askAi(aiQuestion)}
              >
                {aiLoading ? t("aiLoading") : t("aiAsk")}
              </button>
              {aiAnswer ? (
                <div className="rounded-xl border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-card)] p-3 text-sm whitespace-pre-wrap text-[var(--flux-text)]">
                  {aiAnswer}
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {tab === "ceremonies" ? (
          <section className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-[var(--flux-chrome-alpha-12)] px-3 py-2 text-xs font-semibold"
              onClick={() => openPlanning(boardId, sprintId)}
            >
              {tc("ceremony.planning")}
            </button>
            <button type="button" className="rounded-lg border border-[var(--flux-chrome-alpha-12)] px-3 py-2 text-xs font-semibold" onClick={() => openStandup(boardId, sprintId)}>
              {tc("ceremony.standup")}
            </button>
            <button type="button" className="rounded-lg border border-[var(--flux-chrome-alpha-12)] px-3 py-2 text-xs font-semibold" onClick={() => openReview(boardId, sprintId)}>
              {tc("ceremony.review")}
            </button>
            <button type="button" className="rounded-lg border border-[var(--flux-chrome-alpha-12)] px-3 py-2 text-xs font-semibold" onClick={() => openRetro(boardId, sprintId)}>
              {tc("ceremony.retro")}
            </button>
          </section>
        ) : null}

        {tab === "oracle" ? (
          <VelocityOraclePanel boardId={boardId} sprintId={sprintId} getHeaders={getHeaders} />
        ) : null}

        {tab === "retro" ? (
          <AiRetrospectivePanel
            boardId={boardId}
            sprintId={sprintId}
            sprintName={overview.sprint?.name}
            getHeaders={getHeaders}
          />
        ) : null}
      </div>

      <SprintFormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        mode="edit"
        boardId={boardId}
        boards={[{ id: boardId, name: overview.boardName }]}
        sprint={sprint as SprintData}
        getHeaders={getHeaders}
        onSaved={() => {
          setDrawerOpen(false);
          void load();
        }}
      />
    </>
  );
}

function CardList({
  title,
  cards,
  empty,
  localeRoot,
  boardId,
  openBoardLabel,
  missingCardLabel,
}: {
  title: string;
  cards: SprintOverviewPayload["cardsScope"];
  empty: string;
  localeRoot: string;
  boardId: string;
  openBoardLabel: string;
  missingCardLabel: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--flux-chrome-alpha-08)] overflow-hidden">
      <div className="bg-[var(--flux-surface-elevated)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
        {title}
      </div>
      <ul className="divide-y divide-[var(--flux-chrome-alpha-06)]">
        {cards.length === 0 ? (
          <li className="px-4 py-4 text-sm text-[var(--flux-text-muted)]">{empty}</li>
        ) : (
          cards.map((c) => (
            <li key={c.id} className="px-4 py-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="text-sm font-medium text-[var(--flux-text)]">{c.title}</span>
                <span className="ml-2 text-[10px] text-[var(--flux-text-muted)]">[{c.id}]</span>
                {c.missing ? <span className="ml-2 text-[10px] text-[var(--flux-warning)]">{missingCardLabel}</span> : null}
              </div>
              <div className="text-xs text-[var(--flux-text-muted)]">
                {c.bucketLabel || c.bucket}
                {c.storyPoints != null ? ` · ${c.storyPoints} pts` : null}
              </div>
              {!c.missing ? (
                <Link
                  href={`${localeRoot}/board/${encodeURIComponent(boardId)}`}
                  className="text-xs font-semibold text-[var(--flux-primary-light)] hover:underline shrink-0"
                >
                  {openBoardLabel}
                </Link>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
