"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiJson, ApiError, getApiHeaders } from "@/lib/api-client";
import type { ReleaseData, SprintData } from "@/lib/schemas";
import { FluxEmptyState } from "@/components/ui/flux-empty-state";
import { FeatureGateNotice } from "@/components/billing/feature-gate-notice";
import { ReleaseStatusPill } from "@/components/releases/release-status-pill";
import { ReleaseFormDrawer } from "@/components/releases/release-form-drawer";

type Props = {
  boardId: string;
  boardName?: string;
  getHeaders: () => Record<string, string>;
};

/**
 * ReleaseManager — visualização e gerenciamento de releases vinculadas a sprints e cards.
 * Oferece criação inteligente (semver + bump sugerido), notas por IA, transições de status
 * (draft → planned → staging → released / rolled_back) e rollback com trilha auditável.
 */
export function ReleaseManager({ boardId, boardName, getHeaders }: Props) {
  const t = useTranslations("releases");
  const tStatus = useTranslations("releases.statuses");
  const locale = useLocale();
  const localeRoot = `/${locale}`;

  const [releases, setReleases] = useState<ReleaseData[]>([]);
  const [sprints, setSprints] = useState<SprintData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ReleaseData | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [envFilter, setEnvFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [relData, sprintData] = await Promise.all([
        apiGet<{ releases: ReleaseData[] }>(
          `/api/boards/${encodeURIComponent(boardId)}/releases`,
          getHeaders()
        ),
        apiGet<{ sprints: SprintData[] }>(
          `/api/boards/${encodeURIComponent(boardId)}/sprints`,
          getHeaders()
        ).catch(() => ({ sprints: [] })),
      ]);
      setReleases(relData.releases ?? []);
      setSprints(sprintData.sprints ?? []);
      if (!selectedId && relData.releases?.[0]) setSelectedId(relData.releases[0].id);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 402 || e.status === 403)) setError("upgrade");
      else if (e instanceof ApiError && e.status === 401) setError("auth");
      else setError("load");
    } finally {
      setLoading(false);
    }
  }, [boardId, getHeaders, selectedId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = [...releases];
    if (envFilter) list = list.filter((r) => r.environment === envFilter);
    if (statusFilter) list = list.filter((r) => r.status === statusFilter);
    list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return list;
  }, [releases, envFilter, statusFilter]);

  const selected = useMemo(() => releases.find((r) => r.id === selectedId) ?? null, [releases, selectedId]);

  const openCreate = () => {
    setEditing(null);
    setDrawerOpen(true);
  };
  const openEdit = (r: ReleaseData) => {
    setEditing(r);
    setDrawerOpen(true);
  };

  const generateAiNotes = async (r: ReleaseData) => {
    setAiBusy(true);
    try {
      const data = await apiJson<{
        aiNotes: string;
        suggestedVersionType: string;
        healthScore: number;
        changelog: unknown[];
      }>(
        `/api/boards/${encodeURIComponent(boardId)}/releases/${encodeURIComponent(r.id)}/ai-notes`,
        {
          method: "POST",
          body: JSON.stringify({ locale, voice: "concise" }),
          headers: getApiHeaders(getHeaders()),
        }
      );
      setReleases((prev) =>
        prev.map((x) =>
          x.id === r.id
            ? { ...x, aiNotes: data.aiNotes, healthScore: data.healthScore, changelog: x.changelog }
            : x
        )
      );
    } catch {
      /* keep quiet — a UI mantém o estado anterior */
    } finally {
      setAiBusy(false);
    }
  };

  const setStatus = async (r: ReleaseData, status: ReleaseData["status"]) => {
    try {
      const data = await apiJson<{ release: ReleaseData }>(
        `/api/boards/${encodeURIComponent(boardId)}/releases/${encodeURIComponent(r.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
          headers: getApiHeaders(getHeaders()),
        }
      );
      setReleases((prev) => prev.map((x) => (x.id === r.id ? data.release : x)));
    } catch {
      /* keep quiet */
    }
  };

  const rollback = async (r: ReleaseData) => {
    const reason = window.prompt(t("rollbackPrompt"));
    if (reason === null) return;
    try {
      const data = await apiJson<{ release: ReleaseData }>(
        `/api/boards/${encodeURIComponent(boardId)}/releases/${encodeURIComponent(r.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: "rolled_back", rollbackReason: reason }),
          headers: getApiHeaders(getHeaders()),
        }
      );
      setReleases((prev) => prev.map((x) => (x.id === r.id ? data.release : x)));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--flux-text-muted)]">
            {t("pretitle")}
          </p>
          <h1 className="font-display text-2xl font-bold text-[var(--flux-text)]">
            {boardName ? `${t("title")} · ${boardName}` : t("title")}
          </h1>
          <p className="mt-1 text-sm text-[var(--flux-text-muted)]">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`${localeRoot}/board/${encodeURIComponent(boardId)}/sprint-history`}
            className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] px-3 py-1.5 text-xs font-semibold text-[var(--flux-text)] hover:bg-[var(--flux-chrome-alpha-06)]"
          >
            {t("openHistory")}
          </Link>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-[var(--flux-rad-sm)] bg-[var(--flux-primary)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95"
          >
            + {t("newRelease")}
          </button>
        </div>
      </header>

      {error === "upgrade" ? (
        <FeatureGateNotice
          title={t("upgradeTitle")}
          description={t("upgradeDescription")}
          ctaLabel={t("upgradeCta")}
          ctaHref={`${localeRoot}/billing`}
        />
      ) : error ? (
        <div className="rounded-[var(--flux-rad-md)] border border-[var(--flux-warning-alpha-35)] bg-[var(--flux-warning-alpha-08)] px-4 py-3 text-sm">
          {t(`error.${error}`)}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <FilterChip
          label={t("filters.allEnv")}
          active={!envFilter}
          onClick={() => setEnvFilter("")}
        />
        {(["dev", "staging", "production"] as const).map((env) => (
          <FilterChip key={env} label={env} active={envFilter === env} onClick={() => setEnvFilter(env)} />
        ))}
        <span aria-hidden className="mx-1 h-5 w-px self-center bg-[var(--flux-chrome-alpha-12)]" />
        <FilterChip
          label={t("filters.allStatus")}
          active={!statusFilter}
          onClick={() => setStatusFilter("")}
        />
        {(["draft", "planned", "in_review", "staging", "released", "rolled_back"] as const).map((s) => (
          <FilterChip
            key={s}
            label={tStatus(s)}
            active={statusFilter === s}
            onClick={() => setStatusFilter(s)}
          />
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-[var(--flux-text-muted)]">{t("loading")}</p>
      ) : filtered.length === 0 && !error ? (
        <FluxEmptyState
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={{ label: t("newRelease"), onClick: openCreate }}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <ReleaseList
            releases={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
            sprints={sprints}
          />
          {selected ? (
            <ReleaseDetail
              release={selected}
              sprints={sprints}
              aiBusy={aiBusy}
              onEdit={() => openEdit(selected)}
              onGenerate={() => void generateAiNotes(selected)}
              onStatus={(s) => void setStatus(selected, s)}
              onRollback={() => void rollback(selected)}
            />
          ) : (
            <div className="rounded-[var(--flux-rad-md)] border border-dashed border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] p-6 text-center text-sm text-[var(--flux-text-muted)]">
              {t("selectHint")}
            </div>
          )}
        </div>
      )}

      <ReleaseFormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        boardId={boardId}
        release={editing}
        sprints={sprints}
        getHeaders={getHeaders}
        onSaved={(rel) => {
          setReleases((prev) => {
            const exists = prev.some((x) => x.id === rel.id);
            return exists ? prev.map((x) => (x.id === rel.id ? rel : x)) : [rel, ...prev];
          });
          setSelectedId(rel.id);
        }}
      />
    </div>
  );
}

function ReleaseList({
  releases,
  selectedId,
  onSelect,
  sprints,
}: {
  releases: ReleaseData[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  sprints: SprintData[];
}) {
  const tStatus = useTranslations("releases.statuses");
  const sprintById = new Map(sprints.map((s) => [s.id, s]));
  return (
    <ul className="space-y-2">
      {releases.map((r) => {
        const active = selectedId === r.id;
        const sprintNames = r.sprintIds.map((sid) => sprintById.get(sid)?.name).filter(Boolean);
        return (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onSelect(r.id)}
              aria-pressed={active}
              className={`w-full rounded-[var(--flux-rad-md)] border px-4 py-3 text-left transition-all ${
                active
                  ? "border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-06)] shadow-flux-md"
                  : "border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-card)] hover:border-[var(--flux-primary-alpha-22)]"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-[var(--flux-accent-alpha-12)] px-1.5 py-0.5 font-mono text-[11px] font-bold text-[var(--flux-accent)]">
                      v{r.version}
                    </span>
                    <ReleaseStatusPill status={r.status} label={tStatus(r.status)} />
                    <span className="text-[10px] uppercase tracking-wide text-[var(--flux-text-muted)]">
                      {r.environment}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-1 font-display text-sm font-bold text-[var(--flux-text)]">
                    {r.name}
                  </p>
                  {sprintNames.length > 0 ? (
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-[var(--flux-text-muted)]">
                      ↳ {sprintNames.join(", ")}
                    </p>
                  ) : null}
                </div>
                <HealthDial score={r.healthScore} />
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ReleaseDetail({
  release,
  sprints,
  aiBusy,
  onEdit,
  onGenerate,
  onStatus,
  onRollback,
}: {
  release: ReleaseData;
  sprints: SprintData[];
  aiBusy: boolean;
  onEdit: () => void;
  onGenerate: () => void;
  onStatus: (s: ReleaseData["status"]) => void;
  onRollback: () => void;
}) {
  const t = useTranslations("releases.detail");
  const tStatus = useTranslations("releases.statuses");
  const sprintById = new Map(sprints.map((s) => [s.id, s]));
  const linkedSprints = release.sprintIds.map((id) => sprintById.get(id)).filter(Boolean) as SprintData[];

  return (
    <article className="rounded-[var(--flux-rad-lg)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] p-5">
      <header className="flex flex-col gap-2 border-b border-[var(--flux-chrome-alpha-08)] pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded bg-[var(--flux-accent-alpha-12)] px-2 py-0.5 font-mono text-sm font-bold text-[var(--flux-accent)]">
              v{release.version}
            </span>
            <ReleaseStatusPill status={release.status} label={tStatus(release.status)} />
          </div>
          <h2 className="mt-1 font-display text-xl font-bold text-[var(--flux-text)]">{release.name}</h2>
          {release.summary ? (
            <p className="mt-1 text-sm text-[var(--flux-text-muted)]">{release.summary}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] px-2.5 py-1 text-xs font-semibold text-[var(--flux-text)] hover:bg-[var(--flux-chrome-alpha-06)]"
          >
            {t("edit")}
          </button>
          <button
            type="button"
            onClick={onGenerate}
            disabled={aiBusy}
            className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-primary-alpha-25)] bg-[var(--flux-primary-alpha-08)] px-2.5 py-1 text-xs font-semibold text-[var(--flux-primary-light)] hover:bg-[var(--flux-primary-alpha-18)] disabled:opacity-60"
          >
            {aiBusy ? t("generating") : `✨ ${t("generate")}`}
          </button>
        </div>
      </header>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Kpi
          label={t("kpi.cards")}
          value={String(release.cardIds.length)}
          caption={t("kpi.cardsCaption")}
        />
        <Kpi
          label={t("kpi.sprints")}
          value={String(release.sprintIds.length)}
          caption={linkedSprints.map((s) => s.name).slice(0, 2).join(" · ") || "—"}
        />
        <Kpi
          label={t("kpi.risks")}
          value={String(release.risks.length)}
          caption={t("kpi.risksCaption")}
          tone={release.risks.length > 0 ? "warning" : "success"}
        />
      </div>

      <StatusFlow current={release.status} onChange={onStatus} onRollback={onRollback} />

      {release.changelog.length > 0 ? (
        <section className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--flux-text-muted)]">
            {t("changelog")}
          </p>
          <ul className="mt-2 space-y-1.5">
            {release.changelog.slice(0, 12).map((c, i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded-[var(--flux-rad-sm)] bg-[var(--flux-surface-card)] px-2.5 py-1.5"
              >
                <KindBadge kind={c.kind} />
                <span className="flex-1 text-[12px] text-[var(--flux-text)]">{c.title}</span>
                {c.cardId ? (
                  <span className="shrink-0 font-mono text-[10px] text-[var(--flux-text-muted)]">
                    #{c.cardId.slice(-6)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {release.aiNotes || release.humanNotes ? (
        <section className="mt-4 rounded-[var(--flux-rad-md)] border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-card)] p-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--flux-text-muted)]">
              {t("notes")}
            </p>
            <span className="text-[10px] text-[var(--flux-text-muted)]">
              {release.humanNotes ? t("notesHuman") : t("notesAi")}
            </span>
          </div>
          <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-[var(--flux-text)]">
{release.humanNotes || release.aiNotes}
          </pre>
        </section>
      ) : null}

      {release.timeline.length > 0 ? (
        <section className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--flux-text-muted)]">
            {t("timeline")}
          </p>
          <ol className="mt-2 space-y-1.5 border-l-2 border-[var(--flux-chrome-alpha-12)] pl-3">
            {release.timeline
              .slice()
              .reverse()
              .slice(0, 10)
              .map((ev, i) => (
                <li key={i} className="text-[11px] text-[var(--flux-text-muted)]">
                  <span className="font-semibold text-[var(--flux-text)]">{t(`events.${ev.kind}`)}</span>
                  {" · "}
                  {new Date(ev.at).toLocaleString()}
                </li>
              ))}
          </ol>
        </section>
      ) : null}
    </article>
  );
}

function StatusFlow({
  current,
  onChange,
  onRollback,
}: {
  current: ReleaseData["status"];
  onChange: (s: ReleaseData["status"]) => void;
  onRollback: () => void;
}) {
  const t = useTranslations("releases.flow");
  const order: ReleaseData["status"][] = ["draft", "planned", "in_review", "staging", "released"];
  const currentIdx = order.indexOf(current);
  return (
    <div className="mt-4 rounded-[var(--flux-rad-md)] border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-card)] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--flux-text-muted)]">
        {t("title")}
      </p>
      <div className="mt-3 flex items-center gap-2 overflow-x-auto">
        {order.map((s, i) => {
          const past = i < currentIdx;
          const active = i === currentIdx;
          const future = i > currentIdx;
          return (
            <div key={s} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onChange(s)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  active
                    ? "border-[var(--flux-primary)] bg-[var(--flux-primary)] text-white"
                    : past
                      ? "border-[var(--flux-success-alpha-22)] bg-[var(--flux-success-alpha-08)] text-[var(--flux-success)]"
                      : "border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-06)]"
                }`}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    background: active
                      ? "white"
                      : past
                        ? "var(--flux-success)"
                        : "var(--flux-chrome-alpha-18)",
                  }}
                  aria-hidden
                />
                {t(`step.${s}`)}
              </button>
              {i < order.length - 1 ? (
                <span
                  aria-hidden
                  className="h-px w-6"
                  style={{
                    background: future ? "var(--flux-chrome-alpha-12)" : "var(--flux-success)",
                  }}
                />
              ) : null}
            </div>
          );
        })}
        <button
          type="button"
          onClick={onRollback}
          className="ml-auto rounded-full border border-[var(--flux-danger-alpha-22)] bg-[var(--flux-danger-alpha-08)] px-2.5 py-1 text-[11px] font-semibold text-[var(--flux-danger)] hover:bg-[var(--flux-danger-alpha-18)]"
        >
          ⟲ {t("rollback")}
        </button>
      </div>
    </div>
  );
}

function HealthDial({ score }: { score: number | null }) {
  if (score == null) {
    return (
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-[var(--flux-chrome-alpha-18)] text-[10px] text-[var(--flux-text-muted)]">
        —
      </span>
    );
  }
  const tone = score >= 75 ? "var(--flux-success)" : score >= 50 ? "var(--flux-warning)" : "var(--flux-danger)";
  return (
    <span
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
      style={{
        background: `conic-gradient(${tone} ${score * 3.6}deg, var(--flux-chrome-alpha-06) 0)`,
        color: "var(--flux-text)",
        boxShadow: "inset 0 0 0 3px var(--flux-surface-card)",
      }}
      aria-label={`Health ${score}`}
    >
      {score}
    </span>
  );
}

function Kpi({
  label,
  value,
  caption,
  tone = "primary",
}: {
  label: string;
  value: string;
  caption: string;
  tone?: "primary" | "warning" | "success";
}) {
  const color =
    tone === "warning"
      ? "var(--flux-warning)"
      : tone === "success"
        ? "var(--flux-success)"
        : "var(--flux-primary)";
  return (
    <div className="rounded-[var(--flux-rad-md)] border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-card)] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--flux-text-muted)]">
        {label}
      </p>
      <p className="mt-1 font-display text-xl font-bold" style={{ color }}>
        {value}
      </p>
      <p className="text-[11px] text-[var(--flux-text-muted)]">{caption}</p>
    </div>
  );
}

function KindBadge({ kind }: { kind: string }) {
  const color: Record<string, string> = {
    feat: "var(--flux-primary)",
    fix: "var(--flux-warning)",
    breaking: "var(--flux-danger)",
    perf: "var(--flux-info)",
    refactor: "var(--flux-accent)",
    docs: "var(--flux-text-muted)",
    chore: "var(--flux-text-muted)",
  };
  const c = color[kind] ?? "var(--flux-text-muted)";
  return (
    <span
      className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
      style={{ color: c, background: "color-mix(in srgb, currentColor 10%, transparent)" }}
    >
      {kind}
    </span>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
        active
          ? "bg-[var(--flux-primary)] text-white"
          : "border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-06)]"
      }`}
    >
      {label}
    </button>
  );
}
