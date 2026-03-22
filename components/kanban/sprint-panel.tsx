"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSprintStore } from "@/stores/sprint-store";
import { useCeremonyStore } from "@/stores/ceremony-store";
import { apiFetch, getApiHeaders } from "@/lib/api-client";
import type { SprintData } from "@/lib/schemas";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

type SprintPanelProps = {
  boardId: string;
  getHeaders: () => Record<string, string>;
};

type BurndownPoint = { date: string; ideal: number; actual: number };

function daysLeft(sprint: SprintData): number | null {
  if (!sprint.endDate) return null;
  const end = new Date(sprint.endDate + "T00:00:00").getTime();
  const today = new Date().setHours(0, 0, 0, 0);
  return Math.ceil((end - today) / 86400000);
}

function SprintStatusBadge({ status }: { status: SprintData["status"] }) {
  const colors: Record<SprintData["status"], string> = {
    planning: "var(--flux-info)",
    active: "var(--flux-success)",
    review: "var(--flux-warning)",
    closed: "var(--flux-text-muted)",
  };
  const labels: Record<SprintData["status"], string> = {
    planning: "Planejamento",
    active: "Ativo",
    review: "Revisão",
    closed: "Encerrado",
  };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ color: colors[status], background: `color-mix(in srgb, ${colors[status]} 12%, transparent)` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: colors[status] }} />
      {labels[status]}
    </span>
  );
}

export default function SprintPanel({ boardId, getHeaders }: SprintPanelProps) {
  const panelOpen = useSprintStore((s) => s.panelOpenBoard === boardId);
  const sprints = useSprintStore((s) => s.sprintsByBoard[boardId] ?? []);
  const activeSprint = useSprintStore((s) => s.activeSprint[boardId] ?? null);
  const loading = useSprintStore((s) => s.loadingBoard[boardId] ?? false);
  /** Seletores estáveis — evita `useSprintStore()` sem filtro (re-render a cada mudança) e loops #185. */
  const setPanelOpen = useSprintStore((s) => s.setPanelOpen);
  const upsertSprint = useSprintStore((s) => s.upsertSprint);
  const { openRetro, openReview } = useCeremonyStore();

  const getHeadersRef = useRef(getHeaders);
  getHeadersRef.current = getHeaders;

  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null);
  const [burndown, setBurndown] = useState<BurndownPoint[] | null>(null);
  const [burndownLoading, setBurndownLoading] = useState(false);
  const [newSprintName, setNewSprintName] = useState("");
  const [creating, setCreating] = useState(false);
  const [aiPlanLoading, setAiPlanLoading] = useState(false);
  const [aiPlan, setAiPlan] = useState<{ summary: string; recommendedCardIds: string[]; reasoning: string } | null>(null);

  const selectedSprint = sprints.find((s) => s.id === selectedSprintId) ?? activeSprint ?? sprints[0] ?? null;

  const loadSprints = useCallback(async () => {
    const { setLoadingBoard: setLoading, setSprints: setList, setActiveSprint: setActive } = useSprintStore.getState();
    setLoading(boardId, true);
    try {
      const res = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}/sprints`, {
        headers: getApiHeaders(getHeadersRef.current()),
      });
      if (res.ok) {
        const data = await res.json() as { sprints: SprintData[] };
        setList(boardId, data.sprints);
        const active = data.sprints.find((s) => s.status === "active") ?? null;
        setActive(boardId, active);
      }
    } finally {
      setLoading(boardId, false);
    }
  }, [boardId]);

  useEffect(() => {
    if (!panelOpen) return;
    void loadSprints();
  }, [panelOpen, loadSprints]);

  useEffect(() => {
    if (!selectedSprint) return;
    if (selectedSprint.status === "active" || selectedSprint.status === "review") {
      setBurndownLoading(true);
      void apiFetch(`/api/boards/${encodeURIComponent(boardId)}/sprints/${selectedSprint.id}/burndown`, {
        headers: getApiHeaders(getHeadersRef.current()),
      }).then(async (res) => {
        if (res.ok) {
          const data = await res.json() as { burndown?: { days: BurndownPoint[] } };
          setBurndown(data.burndown?.days ?? null);
        }
      }).finally(() => setBurndownLoading(false));
    } else {
      setBurndown(null);
    }
  }, [boardId, selectedSprint?.id, selectedSprint?.status]);

  const handleCreateSprint = async () => {
    const name = newSprintName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}/sprints`, {
        method: "POST",
        body: JSON.stringify({ name }),
        headers: getApiHeaders(getHeadersRef.current()),
      });
      if (res.ok) {
        const data = await res.json() as { sprint: SprintData };
        upsertSprint(boardId, data.sprint);
        setNewSprintName("");
        setSelectedSprintId(data.sprint.id);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleStartSprint = async (sprintId: string) => {
    const res = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}/sprints/${sprintId}/start`, {
      method: "POST",
      headers: getApiHeaders(getHeadersRef.current()),
    });
    if (res.ok) {
      const data = await res.json() as { sprint: SprintData };
      upsertSprint(boardId, data.sprint);
    }
  };

  const handleCompleteSprint = async (sprintId: string) => {
    const res = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}/sprints/${sprintId}/complete`, {
      method: "POST",
      headers: getApiHeaders(getHeadersRef.current()),
    });
    if (res.ok) {
      const data = await res.json() as { sprint: SprintData };
      upsertSprint(boardId, data.sprint);
    }
  };

  const handleAiPlan = async (sprintId: string) => {
    setAiPlanLoading(true);
    setAiPlan(null);
    try {
      const res = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}/sprints/${sprintId}/planning-ai`, {
        method: "POST",
        headers: getApiHeaders(getHeadersRef.current()),
      });
      if (res.ok) {
        const data = await res.json() as { suggestion?: { summary: string; recommendedCardIds: string[]; reasoning: string } };
        if (data.suggestion) setAiPlan(data.suggestion);
      }
    } finally {
      setAiPlanLoading(false);
    }
  };

  const days = selectedSprint ? daysLeft(selectedSprint) : null;
  const completionPct = selectedSprint && selectedSprint.cardIds.length > 0
    ? Math.round((selectedSprint.doneCardIds.length / selectedSprint.cardIds.length) * 100)
    : 0;

  return (
    <>
      {/* Backdrop on mobile */}
      {panelOpen && (
        <div
          className="fixed inset-0 z-[199] bg-black/40 sm:hidden"
          onClick={() => setPanelOpen(null)}
          aria-hidden
        />
      )}
      {/* Panel — bottom-sheet on mobile, side-drawer on sm+ */}
      <div
        className={`fixed z-[200] flex flex-col bg-[var(--flux-surface-card)] shadow-[var(--flux-shadow-modal-depth)] transition-transform duration-300 ease-[var(--flux-ease-standard)]
          bottom-0 left-0 right-0 h-[90dvh] rounded-t-2xl border-t border-[var(--flux-chrome-alpha-08)]
          sm:top-0 sm:bottom-auto sm:right-0 sm:left-auto sm:h-full sm:w-[420px] sm:rounded-t-none sm:border-t-0 sm:border-l
          ${panelOpen ? "translate-y-0 sm:translate-x-0" : "translate-y-full sm:translate-y-0 sm:translate-x-full"}`}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between gap-3 border-b border-[var(--flux-chrome-alpha-06)] px-5 py-4">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-[var(--flux-primary)]" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="font-display font-bold text-base text-[var(--flux-text)]">Sprint</span>
            {activeSprint && (
              <span className="ml-1 rounded-full bg-[var(--flux-success-alpha-12)] border border-[var(--flux-success-alpha-35)] px-2 py-0.5 text-[11px] font-semibold text-[var(--flux-success)]">
                {activeSprint.name}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setPanelOpen(null)}
            className="h-8 w-8 rounded-full border border-[var(--flux-chrome-alpha-10)] text-[var(--flux-text-muted)] flex items-center justify-center hover:bg-[var(--flux-chrome-alpha-06)]"
            aria-label="Fechar painel Sprint"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4" aria-hidden>
              <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-kanban px-5 py-4 space-y-5">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-[var(--flux-chrome-alpha-06)]" />
              ))}
            </div>
          ) : (
            <>
              {/* Sprint selector */}
              {sprints.length > 0 && (
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)] mb-2">
                    Sprints
                  </label>
                  <div className="space-y-1.5">
                    {sprints.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedSprintId(s.id)}
                        className={`w-full flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-left transition-all ${
                          selectedSprint?.id === s.id
                            ? "border-[var(--flux-primary-alpha-45)] bg-[var(--flux-primary-alpha-08)]"
                            : "border-[var(--flux-chrome-alpha-06)] hover:border-[var(--flux-chrome-alpha-12)]"
                        }`}
                      >
                        <div>
                          <div className="text-sm font-semibold text-[var(--flux-text)]">{s.name}</div>
                          {s.goal && <div className="text-[11px] text-[var(--flux-text-muted)] truncate max-w-[220px]">{s.goal}</div>}
                        </div>
                        <SprintStatusBadge status={s.status} />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Selected sprint details */}
              {selectedSprint && (
                <div className="rounded-2xl border border-[var(--flux-chrome-alpha-06)] bg-[var(--flux-surface-elevated)] p-4 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-display font-bold text-base text-[var(--flux-text)]">{selectedSprint.name}</h3>
                      {selectedSprint.goal && <p className="text-xs text-[var(--flux-text-muted)] mt-0.5">{selectedSprint.goal}</p>}
                    </div>
                    <SprintStatusBadge status={selectedSprint.status} />
                  </div>

                  {/* Progress */}
                  {selectedSprint.cardIds.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between text-[11px] text-[var(--flux-text-muted)] mb-1.5">
                        <span>Progresso</span>
                        <span className="font-semibold tabular-nums">{selectedSprint.doneCardIds.length}/{selectedSprint.cardIds.length} cards — {completionPct}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-[var(--flux-chrome-alpha-08)] overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${completionPct === 100 ? "bg-[var(--flux-success)]" : "bg-[var(--flux-primary)]"}`}
                          style={{ width: `${completionPct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Days remaining */}
                  {days !== null && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-[var(--flux-text-muted)]" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className={`font-semibold ${days < 0 ? "text-[var(--flux-danger)]" : days <= 3 ? "text-[var(--flux-warning)]" : "text-[var(--flux-text-muted)]"}`}>
                        {days < 0 ? `${Math.abs(days)} dias em atraso` : days === 0 ? "Encerra hoje" : `${days} dias restantes`}
                      </span>
                    </div>
                  )}

                  {/* Burndown chart */}
                  {burndownLoading ? (
                    <div className="h-36 animate-pulse rounded-xl bg-[var(--flux-chrome-alpha-06)]" />
                  ) : burndown && burndown.length > 0 ? (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)] mb-2">Burndown</p>
                      <div className="h-36 min-h-[144px]">
                        <ResponsiveContainer width="100%" height="100%" debounce={200}>
                          <LineChart data={burndown} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                            <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                            <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                            <Line type="monotone" dataKey="ideal" stroke="var(--flux-text-muted)" strokeDasharray="4 2" strokeWidth={1.5} dot={false} name="Ideal" />
                            <Line type="monotone" dataKey="actual" stroke="var(--flux-primary)" strokeWidth={2} dot={false} name="Real" />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ) : null}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {selectedSprint.status === "planning" && (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleStartSprint(selectedSprint.id)}
                          className="flex-1 rounded-lg bg-[var(--flux-primary)] px-3 py-2 text-xs font-semibold text-white hover:bg-[var(--flux-primary-light)] transition-colors"
                        >
                          ▶ Iniciar Sprint
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleAiPlan(selectedSprint.id)}
                          disabled={aiPlanLoading}
                          className="flex-1 rounded-lg border border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-08)] px-3 py-2 text-xs font-semibold text-[var(--flux-primary-light)] hover:bg-[var(--flux-primary-alpha-15)] disabled:opacity-50 transition-all"
                        >
                          {aiPlanLoading ? "Analisando…" : "✨ Sugestão IA"}
                        </button>
                      </>
                    )}
                    {selectedSprint.status === "active" && (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleCompleteSprint(selectedSprint.id)}
                          className="flex-1 rounded-lg border border-[var(--flux-success-alpha-35)] bg-[var(--flux-success-alpha-08)] px-3 py-2 text-xs font-semibold text-[var(--flux-success)] hover:bg-[var(--flux-success-alpha-15)] transition-all"
                        >
                          ✓ Completar Sprint
                        </button>
                      </>
                    )}
                    {(selectedSprint.status === "active" || selectedSprint.status === "review") && (
                      <>
                        <button
                          type="button"
                          onClick={() => openRetro(selectedSprint.id)}
                          className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-all ${
                            selectedSprint.status === "review"
                              ? "border-[var(--flux-secondary-alpha-45)] bg-[var(--flux-secondary-alpha-08)] text-[var(--flux-secondary)] hover:bg-[var(--flux-secondary-alpha-15)] animate-pulse"
                              : "border-[var(--flux-chrome-alpha-12)] text-[var(--flux-text-muted)] hover:border-[var(--flux-secondary-alpha-35)] hover:text-[var(--flux-secondary)]"
                          }`}
                        >
                          🔁 Retrospectiva
                        </button>
                        <button
                          type="button"
                          onClick={() => openReview(selectedSprint.id)}
                          className="flex-1 rounded-lg border border-[var(--flux-chrome-alpha-12)] px-3 py-2 text-xs font-semibold text-[var(--flux-text-muted)] hover:border-[var(--flux-info-alpha-35)] hover:text-[var(--flux-info)] transition-all"
                        >
                          📊 Review
                        </button>
                      </>
                    )}
                  </div>

                  {/* AI Plan output */}
                  {aiPlan && (
                    <div className="rounded-xl border border-[var(--flux-primary-alpha-22)] bg-[var(--flux-primary-alpha-04)] p-3 space-y-2">
                      <p className="text-xs font-semibold text-[var(--flux-primary-light)]">✨ Sugestão IA</p>
                      <p className="text-xs text-[var(--flux-text)]">{aiPlan.summary}</p>
                      <p className="text-[11px] text-[var(--flux-text-muted)]">{aiPlan.reasoning}</p>
                      {aiPlan.recommendedCardIds.length > 0 && (
                        <p className="text-[11px] text-[var(--flux-text-muted)]">
                          Cards sugeridos: <span className="font-mono text-[var(--flux-primary-light)]">{aiPlan.recommendedCardIds.join(", ")}</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Create new sprint */}
              <div className="rounded-xl border border-dashed border-[var(--flux-chrome-alpha-10)] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)] mb-2">Novo Sprint</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSprintName}
                    onChange={(e) => setNewSprintName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void handleCreateSprint(); }}
                    placeholder="Nome do sprint…"
                    className="flex-1 min-w-0 rounded-lg border border-[var(--flux-chrome-alpha-10)] bg-transparent px-3 py-2 text-sm text-[var(--flux-text)] placeholder:text-[var(--flux-text-muted)] outline-none focus:border-[var(--flux-primary)]"
                    maxLength={200}
                  />
                  <button
                    type="button"
                    onClick={() => void handleCreateSprint()}
                    disabled={!newSprintName.trim() || creating}
                    className="rounded-lg bg-[var(--flux-primary)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 hover:bg-[var(--flux-primary-light)] transition-colors"
                  >
                    {creating ? "…" : "Criar"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Backdrop */}
    </>
  );
}
