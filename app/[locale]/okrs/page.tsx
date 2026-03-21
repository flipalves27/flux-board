"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Header } from "@/components/header";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAuth } from "@/context/auth-context";
import { apiDelete, apiGet, apiPost, apiPut, ApiError } from "@/lib/api-client";
import { useToast } from "@/context/toast-context";
import {
  computeOkrsProgress,
  type OkrsKeyResultDefinition,
  type OkrsObjectiveDefinition,
  type OkrsMetricType,
} from "@/lib/okr-engine";
import type { OkrKrProjection } from "@/lib/okr-projection";

type BoardRow = { id: string; name: string; ownerId?: string; lastUpdated?: string; clientLabel?: string };

type OkrByBoardResponse = {
  ok: boolean;
  boardId: string;
  quarter: string | null;
  objectives: Array<{
    objective: any;
    keyResults: any[];
  }>;
};

export default function OkrsPage() {
  const router = useRouter();
  const locale = useLocale();
  const localeRoot = `/${locale}`;

  const { user, getHeaders, isChecked } = useAuth();
  const { pushToast } = useToast();

  const currentQuarter = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const q = Math.floor(now.getMonth() / 3) + 1;
    return `${year}-Q${q}`;
  }, []);

  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string>("");

  const [boardCards, setBoardCards] = useState<Array<{ bucket?: string | null }>>([]);
  const [bucketKeys, setBucketKeys] = useState<Set<string>>(new Set());

  const [okrObjectives, setOkrObjectives] = useState<OkrsObjectiveDefinition[]>([]);
  const [okrProjections, setOkrProjections] = useState<OkrKrProjection[] | null>(null);

  const okrsComputed = useMemo(() => {
    return computeOkrsProgress({ cards: boardCards, objectives: okrObjectives, bucketKeys });
  }, [boardCards, okrObjectives, bucketKeys]);

  const okrProjectionByKrId = useMemo(() => {
    const m = new Map<string, OkrKrProjection>();
    for (const p of okrProjections ?? []) m.set(p.keyResultId, p);
    return m;
  }, [okrProjections]);

  const [objectivesList, setObjectivesList] = useState<Array<{ id: string; title: string }>>([]);

  // Create objective
  const [objectiveTitle, setObjectiveTitle] = useState("");
  const [objectiveOwner, setObjectiveOwner] = useState<string>("");

  // Create key result
  const [krObjectiveId, setKrObjectiveId] = useState<string>("");
  const [krTitle, setKrTitle] = useState("");
  const [krMetricType, setKrMetricType] = useState<OkrsMetricType>("card_count");
  const [krTarget, setKrTarget] = useState<number>(10);
  const [krLinkedColumnKey, setKrLinkedColumnKey] = useState<string>("");
  const [krManualCurrent, setKrManualCurrent] = useState<number>(0);
  const [editingObjectiveId, setEditingObjectiveId] = useState<string | null>(null);
  const [objectiveEditTitle, setObjectiveEditTitle] = useState("");
  const [objectiveEditOwner, setObjectiveEditOwner] = useState("");
  const [objectiveEditQuarter, setObjectiveEditQuarter] = useState(currentQuarter);

  const [editingKrId, setEditingKrId] = useState<string | null>(null);
  const [krEditTitle, setKrEditTitle] = useState("");
  const [krEditMetricType, setKrEditMetricType] = useState<OkrsMetricType>("card_count");
  const [krEditTarget, setKrEditTarget] = useState<number>(0);
  const [krEditLinkedColumnKey, setKrEditLinkedColumnKey] = useState("");
  const [krEditManualCurrent, setKrEditManualCurrent] = useState<number>(0);

  const [confirmDelete, setConfirmDelete] = useState<{
    kind: "objective" | "kr";
    id: string;
    label: string;
  } | null>(null);

  useEffect(() => {
    if (!isChecked || !user) {
      router.replace(`${localeRoot}/login`);
      return;
    }

    (async () => {
      try {
        const r = await apiGet<{ boards: BoardRow[] }>("/api/boards", getHeaders());
        const list = Array.isArray(r?.boards) ? r.boards : [];
        setBoards(list);
        if (!selectedBoardId && list[0]?.id) setSelectedBoardId(list[0].id);
        if (!objectiveOwner) setObjectiveOwner(user?.username || user?.id || "Owner");
      } catch (err) {
        if (err instanceof ApiError) {
          pushToast({ kind: "error", title: err.message });
        } else {
          pushToast({ kind: "error", title: "Erro ao carregar boards" });
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChecked, user, router]);

  async function refreshObjectivesForQuarter(q: string) {
    const r = await apiGet<{ ok: boolean; quarter: string | null; objectives: Array<any> }>(
      `/api/okrs/objectives?quarter=${encodeURIComponent(q)}`,
      getHeaders()
    );
    const list = Array.isArray(r?.objectives) ? r.objectives : [];
    setObjectivesList(list.map((o: any) => ({ id: String(o.id), title: String(o.title || "") })));
  }

  async function refreshBoardAndOkrs() {
    if (!selectedBoardId) return;

    try {
      const board = await apiGet<any>(`/api/boards/${encodeURIComponent(selectedBoardId)}`, getHeaders());
      const cards = Array.isArray(board?.cards) ? (board.cards as any[]) : [];
      const keys = new Set<string>(
        Array.isArray(board?.config?.bucketOrder)
          ? board.config.bucketOrder.map((b: any) => String(b?.key || "")).filter((k: string) => Boolean(k))
          : []
      );
      setBoardCards(cards);
      setBucketKeys(keys);

      const okrsRes = await apiGet<OkrByBoardResponse>(
        `/api/okrs/by-board?boardId=${encodeURIComponent(selectedBoardId)}&quarter=${encodeURIComponent(currentQuarter)}`,
        getHeaders()
      );
      const defs: OkrsObjectiveDefinition[] = Array.isArray(okrsRes?.objectives)
        ? okrsRes.objectives.reduce<OkrsObjectiveDefinition[]>((acc, g) => {
            const obj = g.objective;
            if (!obj) return acc;
            const keyResults: OkrsKeyResultDefinition[] = Array.isArray(g.keyResults) ? (g.keyResults as any[]) : [];
            acc.push({
              id: String(obj.id),
              title: String(obj.title ?? ""),
              owner: obj.owner ?? null,
              quarter: String(obj.quarter ?? currentQuarter),
              keyResults,
            });
            return acc;
          }, [])
        : [];
      setOkrObjectives(defs);

      await refreshObjectivesForQuarter(currentQuarter);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Erro ao carregar OKRs";
      pushToast({ kind: "error", title: msg });
      setOkrObjectives([]);
    }
  }

  useEffect(() => {
    if (!selectedBoardId) return;
    refreshBoardAndOkrs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBoardId, currentQuarter]);

  useEffect(() => {
    let cancelled = false;
    async function loadProj() {
      setOkrProjections(null);
      if (!selectedBoardId || okrObjectives.length === 0) return;
      try {
        const r = await apiGet<{ projections?: OkrKrProjection[] }>(
          `/api/okrs/projection?boardId=${encodeURIComponent(selectedBoardId)}&quarter=${encodeURIComponent(currentQuarter)}`,
          getHeaders()
        );
        if (cancelled) return;
        setOkrProjections(Array.isArray(r?.projections) ? r.projections : []);
      } catch {
        if (cancelled) return;
        setOkrProjections(null);
      }
    }
    loadProj();
    return () => {
      cancelled = true;
    };
  }, [selectedBoardId, currentQuarter, okrObjectives.length, getHeaders]);

  // Keep selection consistent when list refreshes
  useEffect(() => {
    if (!krObjectiveId && objectivesList[0]?.id) setKrObjectiveId(objectivesList[0].id);
  }, [objectivesList, krObjectiveId]);

  useEffect(() => {
    if (!krLinkedColumnKey && bucketKeys.size > 0) setKrLinkedColumnKey(Array.from(bucketKeys)[0]);
  }, [bucketKeys, krLinkedColumnKey]);

  async function onCreateObjective(e: React.FormEvent) {
    e.preventDefault();
    if (!objectiveTitle.trim()) return;

    try {
      await apiPost("/api/okrs/objectives", { title: objectiveTitle.trim(), quarter: currentQuarter, owner: objectiveOwner }, getHeaders());
      setObjectiveTitle("");
      await refreshObjectivesForQuarter(currentQuarter);
      await refreshBoardAndOkrs();
      pushToast({ kind: "success", title: "Objective criada." });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Erro ao criar Objective";
      pushToast({ kind: "error", title: msg });
    }
  }

  async function onCreateKeyResult(e: React.FormEvent) {
    e.preventDefault();
    if (!krObjectiveId) return;
    if (!krTitle.trim()) return;
    if (!selectedBoardId) return;

    try {
      await apiPost(
        "/api/okrs/key-results",
        {
          objectiveId: krObjectiveId,
          title: krTitle.trim(),
          metric_type: krMetricType,
          target: krTarget,
          linkedBoardId: selectedBoardId,
          linkedColumnKey: krMetricType === "card_in_column" ? krLinkedColumnKey : null,
          manualCurrent: krMetricType === "Manual" ? krManualCurrent : null,
        },
        getHeaders()
      );

      setKrTitle("");
      pushToast({ kind: "success", title: "Key Result criado." });
      await refreshBoardAndOkrs();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Erro ao criar Key Result";
      pushToast({ kind: "error", title: msg });
    }
  }

  function startEditObjective(o: OkrsObjectiveDefinition) {
    setEditingObjectiveId(o.id);
    setObjectiveEditTitle(o.title);
    setObjectiveEditOwner(o.owner ?? "");
    setObjectiveEditQuarter(o.quarter);
  }

  function cancelEditObjective() {
    setEditingObjectiveId(null);
  }

  async function saveObjectiveEdit(objectiveId: string) {
    if (!objectiveEditTitle.trim()) return;
    try {
      await apiPut(
        `/api/okrs/objectives/${encodeURIComponent(objectiveId)}`,
        {
          title: objectiveEditTitle.trim(),
          owner: objectiveEditOwner.trim() || null,
          quarter: objectiveEditQuarter.trim(),
        },
        getHeaders()
      );
      pushToast({ kind: "success", title: "Objective atualizada." });
      setEditingObjectiveId(null);
      await refreshBoardAndOkrs();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Erro ao atualizar Objective";
      pushToast({ kind: "error", title: msg });
    }
  }

  async function onDeleteObjective(objectiveId: string) {
    try {
      await apiDelete(`/api/okrs/objectives/${encodeURIComponent(objectiveId)}`, getHeaders());
      pushToast({ kind: "success", title: "Objective excluída." });
      await refreshBoardAndOkrs();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Erro ao excluir Objective";
      pushToast({ kind: "error", title: msg });
    }
  }

  function startEditKr(kr: OkrsKeyResultDefinition) {
    setEditingKrId(kr.id);
    setKrEditTitle(kr.title);
    setKrEditMetricType(kr.metric_type);
    setKrEditTarget(Number(kr.target) || 0);
    setKrEditLinkedColumnKey(kr.linkedColumnKey ?? "");
    setKrEditManualCurrent(Number(kr.manualCurrent ?? 0) || 0);
  }

  function cancelEditKr() {
    setEditingKrId(null);
  }

  async function saveKrEdit(krId: string) {
    if (!krEditTitle.trim()) return;
    try {
      await apiPut(
        `/api/okrs/key-results/${encodeURIComponent(krId)}`,
        {
          title: krEditTitle.trim(),
          metric_type: krEditMetricType,
          target: Math.max(0, Number(krEditTarget) || 0),
          linkedBoardId: selectedBoardId,
          linkedColumnKey: krEditMetricType === "card_in_column" ? krEditLinkedColumnKey : null,
          manualCurrent: krEditMetricType === "Manual" ? Math.max(0, Number(krEditManualCurrent) || 0) : null,
        },
        getHeaders()
      );
      pushToast({ kind: "success", title: "Key Result atualizado." });
      setEditingKrId(null);
      await refreshBoardAndOkrs();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Erro ao atualizar Key Result";
      pushToast({ kind: "error", title: msg });
    }
  }

  async function onDeleteKr(krId: string) {
    try {
      await apiDelete(`/api/okrs/key-results/${encodeURIComponent(krId)}`, getHeaders());
      pushToast({ kind: "success", title: "Key Result excluído." });
      await refreshBoardAndOkrs();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Erro ao excluir Key Result";
      pushToast({ kind: "error", title: msg });
    }
  }

  return (
    <div className="min-h-screen bg-[var(--flux-surface-dark)]">
      <Header title="Flux Goals (OKRs)" backHref={`${localeRoot}/boards`} backLabel="← Boards" />

      <main className="max-w-[1300px] mx-auto px-6 py-7 grid grid-cols-1 xl:grid-cols-[1fr,420px] gap-6">
        <section className="bg-[var(--flux-surface-card)] border border-[var(--flux-primary-alpha-20)] rounded-[var(--flux-rad-lg)] p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <h2 className="font-display font-bold text-lg text-[var(--flux-text)]">OKRs do trimestre</h2>
            <div className="text-xs text-[var(--flux-text-muted)] text-right max-w-[280px]">
              Quarter: {currentQuarter}
              <div className="text-[10px] mt-1 opacity-90">
                Projeção linear (4 sem.) e alertas usam throughput de conclusões via Copilot no board vinculado.
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">Board</label>
              <select
                value={selectedBoardId}
                onChange={(e) => setSelectedBoardId(e.target.value)}
                className="w-full px-3 py-2 rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
              >
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-chrome-alpha-03)] p-3">
              <div className="text-[11px] uppercase tracking-wide font-semibold text-[var(--flux-primary-light)]">
                Progresso objetivo
              </div>
              <div className="mt-1 text-xs text-[var(--flux-text-muted)]">
                Agregação com <b>min</b> (KR mais travado define o andamento).
              </div>
            </div>
          </div>

          {okrObjectives.length === 0 ? (
            <p className="text-[var(--flux-text-muted)] text-sm">
              Nenhum OKR vinculado a este board/quarter ainda. Crie um Objective e um Key Result na coluna da direita.
            </p>
          ) : (
            <div className="space-y-3">
              {okrsComputed.map((o) => (
                <div
                  key={o.objective.id}
                  className="rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-primary-alpha-06)] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-display font-bold text-[var(--flux-text)] truncate">{o.objective.title}</div>
                        {editingObjectiveId === o.objective.id && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full border border-[var(--flux-primary-alpha-45)] bg-[var(--flux-primary-alpha-16)] text-[var(--flux-primary-light)] font-semibold">
                            editando
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-[var(--flux-text-muted)] mt-0.5">Status: {o.status}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-display font-bold text-xs text-[var(--flux-text)]">{o.objectiveCurrentPct}%</div>
                      <div className="text-[10px] text-[var(--flux-text-muted)]">min dos KRs</div>
                      <div className="mt-1 flex gap-1 justify-end">
                        <button
                          type="button"
                          className="btn-sm border-[var(--flux-primary-alpha-35)] text-[var(--flux-primary-light)]"
                          onClick={() => startEditObjective(o.objective)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="btn-sm border-[var(--flux-danger-alpha-40)] text-[var(--flux-danger)]"
                          onClick={() =>
                            setConfirmDelete({
                              kind: "objective",
                              id: o.objective.id,
                              label: o.objective.title,
                            })
                          }
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  </div>

                  <div
                    className={`mt-3 overflow-hidden transition-all duration-300 ease-out ${
                      editingObjectiveId === o.objective.id ? "max-h-[220px] opacity-100" : "max-h-0 opacity-0"
                    }`}
                  >
                    <div className="rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-elevated)] p-3 grid grid-cols-1 md:grid-cols-3 gap-2">
                      <input
                        value={objectiveEditTitle}
                        onChange={(e) => setObjectiveEditTitle(e.target.value)}
                        className="px-3 py-2 rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                        placeholder="Título"
                      />
                      <input
                        value={objectiveEditOwner}
                        onChange={(e) => setObjectiveEditOwner(e.target.value)}
                        className="px-3 py-2 rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                        placeholder="Owner"
                      />
                      <input
                        value={objectiveEditQuarter}
                        onChange={(e) => setObjectiveEditQuarter(e.target.value)}
                        className="px-3 py-2 rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                        placeholder="Quarter"
                      />
                      <div className="md:col-span-3 flex justify-end gap-2">
                        <button type="button" className="btn-secondary" onClick={cancelEditObjective}>
                          Cancelar
                        </button>
                        <button type="button" className="btn-primary" onClick={() => saveObjectiveEdit(o.objective.id)}>
                          Salvar
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 h-2 rounded-full bg-[var(--flux-chrome-alpha-08)] overflow-hidden">
                    <div className="h-full bg-[var(--flux-primary)]" style={{ width: `${o.objectiveCurrentPct}%` }} />
                  </div>

                  <details className="mt-2">
                    <summary className="cursor-pointer text-[11px] text-[var(--flux-secondary)] font-semibold select-none">
                      Ver KRs ({o.keyResults.length})
                    </summary>
                    <div className="mt-2 space-y-2">
                      {o.keyResults.map((kr) => {
                        const proj = okrProjectionByKrId.get(kr.definition.id);
                        return (
                        <div
                          key={kr.definition.id}
                          className={`rounded-md p-2.5 ${
                            proj?.riskBelowThreshold
                              ? "border border-[var(--flux-danger-alpha-45)] bg-[var(--flux-danger-soft-06)]"
                              : "border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-chrome-alpha-04)]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <div className="text-[11px] font-semibold text-[var(--flux-text)] truncate">{kr.definition.title}</div>
                                {editingKrId === kr.definition.id && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-[var(--flux-primary-alpha-45)] bg-[var(--flux-primary-alpha-16)] text-[var(--flux-primary-light)] font-semibold">
                                    editando
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-[var(--flux-text-muted)] mt-0.5">
                                {kr.linkBroken ? "Link quebrado (coluna removida)" : kr.status}
                              </div>
                              {proj && (
                                <div className="mt-1.5 space-y-0.5">
                                  <div
                                    className={`text-[10px] leading-snug ${
                                      proj.riskBelowThreshold ? "text-[var(--flux-danger)] font-semibold" : "text-[var(--flux-text)]"
                                    }`}
                                  >
                                    {proj.summaryLine}
                                  </div>
                                  <div className="text-[9px] text-[var(--flux-text-muted)] leading-snug">{proj.detailLine}</div>
                                </div>
                              )}
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="font-display font-bold text-[11px] text-[var(--flux-text)]">{kr.pct}%</div>
                              <div className="text-[10px] text-[var(--flux-text-muted)]">
                                {kr.current} / {kr.definition.target}
                              </div>
                              {proj && (
                                <div className="text-[9px] text-[var(--flux-text-muted)] mt-0.5">
                                  proj. fim Q: ~{proj.projectedPctAtQuarterEnd}%
                                </div>
                              )}
                              <div className="mt-1 flex gap-1 justify-end">
                                <button
                                  type="button"
                                  className="btn-sm border-[var(--flux-primary-alpha-35)] text-[var(--flux-primary-light)]"
                                  onClick={() => startEditKr(kr.definition)}
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  className="btn-sm border-[var(--flux-danger-alpha-40)] text-[var(--flux-danger)]"
                                  onClick={() =>
                                    setConfirmDelete({
                                      kind: "kr",
                                      id: kr.definition.id,
                                      label: kr.definition.title,
                                    })
                                  }
                                >
                                  Excluir
                                </button>
                              </div>
                            </div>
                          </div>

                          <div
                            className={`mt-2 overflow-hidden transition-all duration-300 ease-out ${
                              editingKrId === kr.definition.id ? "max-h-[320px] opacity-100" : "max-h-0 opacity-0"
                            }`}
                          >
                            <div className="rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-18)] bg-[var(--flux-surface-card)] p-2.5 grid grid-cols-1 md:grid-cols-2 gap-2">
                              <input
                                value={krEditTitle}
                                onChange={(e) => setKrEditTitle(e.target.value)}
                                className="px-3 py-2 rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                                placeholder="Título do KR"
                              />
                              <select
                                value={krEditMetricType}
                                onChange={(e) => setKrEditMetricType(e.target.value as OkrsMetricType)}
                                className="px-3 py-2 rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                              >
                                <option value="card_count">card_count</option>
                                <option value="card_in_column">card_in_column</option>
                                <option value="Manual">Manual</option>
                              </select>
                              <input
                                type="number"
                                value={krEditTarget}
                                onChange={(e) => setKrEditTarget(Math.max(0, Number(e.target.value) || 0))}
                                className="px-3 py-2 rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                                placeholder="Target"
                              />
                              {krEditMetricType === "card_in_column" ? (
                                <select
                                  value={krEditLinkedColumnKey}
                                  onChange={(e) => setKrEditLinkedColumnKey(e.target.value)}
                                  className="px-3 py-2 rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                                >
                                  {Array.from(bucketKeys).map((k) => (
                                    <option key={k} value={k}>
                                      {k}
                                    </option>
                                  ))}
                                </select>
                              ) : krEditMetricType === "Manual" ? (
                                <input
                                  type="number"
                                  value={krEditManualCurrent}
                                  onChange={(e) => setKrEditManualCurrent(Math.max(0, Number(e.target.value) || 0))}
                                  className="px-3 py-2 rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                                  placeholder="Manual current"
                                />
                              ) : (
                                <div />
                              )}
                              <div className="md:col-span-2 flex justify-end gap-2">
                                <button type="button" className="btn-secondary" onClick={cancelEditKr}>
                                  Cancelar
                                </button>
                                <button type="button" className="btn-primary" onClick={() => saveKrEdit(kr.definition.id)}>
                                  Salvar
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </details>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="bg-[var(--flux-surface-card)] border border-[var(--flux-primary-alpha-20)] rounded-[var(--flux-rad-lg)] p-5 space-y-5">
          <section>
            <h3 className="font-display font-bold text-base text-[var(--flux-text)]">Criar Objective</h3>
            <p className="text-sm text-[var(--flux-text-muted)] mt-1">
              Um Objective é o “objetivo final”. Ele só anda quando <b>todos</b> os KRs melhoram (agregação com <b>min</b>).
            </p>

            <form onSubmit={onCreateObjective} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">Título</label>
                <input
                  value={objectiveTitle}
                  onChange={(e) => setObjectiveTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                  placeholder="Ex: Aumentar pipeline no trimestre"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">Owner</label>
                <input
                  value={objectiveOwner}
                  onChange={(e) => setObjectiveOwner(e.target.value)}
                  className="w-full px-3 py-2 rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                  placeholder="Quem é responsável"
                />
              </div>
              <button className="btn-primary w-full" type="submit">
                Criar objective
              </button>
            </form>
          </section>

          <section>
            <h3 className="font-display font-bold text-base text-[var(--flux-text)]">Criar Key Result</h3>
            <p className="text-sm text-[var(--flux-text-muted)] mt-1">
              Vincule este KR a um board e, opcionalmente, a uma coluna (bucket) do Kanban para medir “quantos cards estão lá”.
            </p>

            <form onSubmit={onCreateKeyResult} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">Objective</label>
                <select
                  value={krObjectiveId}
                  onChange={(e) => setKrObjectiveId(e.target.value)}
                  className="w-full px-3 py-2 rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                  required
                >
                  {objectivesList.length === 0 ? <option value="">Sem objectives</option> : null}
                  {objectivesList.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">Título</label>
                <input
                  value={krTitle}
                  onChange={(e) => setKrTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                  placeholder="Ex: Fechar 30 deals"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">Metric type</label>
                <select
                  value={krMetricType}
                  onChange={(e) => setKrMetricType(e.target.value as OkrsMetricType)}
                  className="w-full px-3 py-2 rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                >
                  <option value="card_count">card_count (cards do board)</option>
                  <option value="card_in_column">card_in_column (cards numa coluna)</option>
                  <option value="Manual">Manual</option>
                </select>
              </div>

              {krMetricType === "card_in_column" && (
                <div>
                  <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">
                    Coluna (bucket)
                  </label>
                  <select
                    value={krLinkedColumnKey}
                    onChange={(e) => setKrLinkedColumnKey(e.target.value)}
                    className="w-full px-3 py-2 rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                  >
                    {Array.from(bucketKeys).map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {krMetricType === "Manual" && (
                <div>
                  <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">Manual current</label>
                  <input
                    type="number"
                    value={krManualCurrent}
                    onChange={(e) => setKrManualCurrent(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-2 rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">Target</label>
                <input
                  type="number"
                  value={krTarget}
                  onChange={(e) => setKrTarget(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full px-3 py-2 rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                  required
                />
              </div>

              <button className="btn-primary w-full" type="submit">
                Criar key result
              </button>
            </form>
          </section>
        </aside>
      </main>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={
          confirmDelete?.kind === "objective"
            ? `Excluir objective "${confirmDelete?.label}"?`
            : `Excluir KR "${confirmDelete?.label}"?`
        }
        description={
          confirmDelete?.kind === "objective"
            ? "Esta ação também remove todos os KRs vinculados."
            : "Esta ação não pode ser desfeita."
        }
        intent="danger"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          const target = confirmDelete;
          setConfirmDelete(null);
          if (target.kind === "objective") {
            await onDeleteObjective(target.id);
          } else {
            await onDeleteKr(target.id);
          }
        }}
      />
    </div>
  );
}

