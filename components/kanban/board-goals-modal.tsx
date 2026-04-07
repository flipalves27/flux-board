"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { apiGet } from "@/lib/api-client";
import { IconGoals, IconClose } from "@/components/sidebar/icons";
import {
  computeOkrsProgress,
  type OkrsKeyResultDefinition,
  type OkrsObjectiveComputed,
  type OkrsObjectiveDefinition,
} from "@/lib/okr-engine";
import type { OkrKrProjection } from "@/lib/okr-projection";

type OkrByBoardResponse = {
  ok: boolean;
  boardId: string;
  quarter: string | null;
  objectives: Array<{
    objective: Record<string, unknown> | null | undefined;
    keyResults: unknown[];
  }>;
};

type BoardGoalsModalProps = {
  boardId: string;
  isOpen: boolean;
  onClose: () => void;
};

function buildObjectiveDefinitions(
  objectives: OkrByBoardResponse["objectives"],
  quarterFallback: string
): OkrsObjectiveDefinition[] {
  if (!Array.isArray(objectives)) return [];
  return objectives.reduce<OkrsObjectiveDefinition[]>((acc, g) => {
    const obj = g.objective;
    if (!obj || typeof obj !== "object") return acc;
    const id = obj.id;
    if (typeof id !== "string" && typeof id !== "number") return acc;
    const keyResults: OkrsKeyResultDefinition[] = Array.isArray(g.keyResults)
      ? (g.keyResults as OkrsKeyResultDefinition[])
      : [];
    acc.push({
      id: String(id),
      title: String(obj.title ?? ""),
      owner: (obj.owner as string | null | undefined) ?? null,
      quarter: String(obj.quarter ?? quarterFallback),
      keyResults,
    });
    return acc;
  }, []);
}

export function BoardGoalsModal({ boardId, isOpen, onClose }: BoardGoalsModalProps) {
  const t = useTranslations("navigation");
  const { user, isChecked, getHeaders } = useAuth();
  const [computedObjectives, setComputedObjectives] = useState<OkrsObjectiveComputed[]>([]);
  const [loading, setLoading] = useState(false);
  const [projections, setProjections] = useState<Map<string, OkrKrProjection>>(new Map());

  const currentQuarter = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const q = Math.floor(now.getMonth() / 3) + 1;
    return `${year}-Q${q}`;
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    async function loadData() {
      if (!isChecked || !user?.orgId || !boardId) return;

      setLoading(true);
      try {
        const headers = getHeaders();
        const quarterQ = encodeURIComponent(currentQuarter);
        const boardIdQ = encodeURIComponent(boardId);

        const [okrsOutcome, projOutcome, boardOutcome] = await Promise.allSettled([
          apiGet<OkrByBoardResponse>(
            `/api/okrs/by-board?boardId=${boardIdQ}&quarter=${quarterQ}`,
            headers
          ),
          apiGet<{ projections?: OkrKrProjection[] }>(
            `/api/okrs/projection?boardId=${boardIdQ}&quarter=${quarterQ}`,
            headers
          ),
          apiGet<{ cards?: unknown[]; config?: { bucketOrder?: Array<{ key?: string }> } }>(
            `/api/boards/${boardIdQ}`,
            headers
          ),
        ]);

        if (cancelled) return;

        const objectivesDefs =
          okrsOutcome.status === "fulfilled" &&
          okrsOutcome.value?.ok &&
          Array.isArray(okrsOutcome.value.objectives)
            ? buildObjectiveDefinitions(okrsOutcome.value.objectives, currentQuarter)
            : [];

        let cards: Array<{ bucket?: string | null }> = [];
        const bucketKeys = new Set<string>();
        if (boardOutcome.status === "fulfilled" && boardOutcome.value) {
          const board = boardOutcome.value;
          const raw = Array.isArray(board.cards) ? board.cards : [];
          cards = raw.map((c) => {
            if (!c || typeof c !== "object") return {};
            const o = c as Record<string, unknown>;
            return { bucket: typeof o.bucket === "string" ? o.bucket : null };
          });
          const order = board.config?.bucketOrder;
          if (Array.isArray(order)) {
            for (const b of order) {
              const k = typeof b?.key === "string" ? b.key : "";
              if (k) bucketKeys.add(k);
            }
          }
        }

        const computed = computeOkrsProgress({ cards, objectives: objectivesDefs, bucketKeys });
        setComputedObjectives(computed);

        if (projOutcome.status === "fulfilled" && Array.isArray(projOutcome.value?.projections)) {
          const projMap = new Map<string, OkrKrProjection>();
          for (const p of projOutcome.value.projections) {
            if (p && typeof p.keyResultId === "string") projMap.set(p.keyResultId, p);
          }
          setProjections(projMap);
        } else {
          setProjections(new Map());
        }
      } catch {
        if (!cancelled) {
          setComputedObjectives([]);
          setProjections(new Map());
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [isOpen, boardId, isChecked, user?.orgId, currentQuarter, getHeaders]);

  if (!isOpen) return null;

  const hasObjectives = computedObjectives.length > 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[var(--flux-z-modal-backdrop)] bg-[var(--flux-surface-dark)]/40 backdrop-blur-[2px] transition-opacity duration-300 ease-out animate-[fadeIn_0.3s_ease]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[var(--flux-z-modal)] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="w-full max-w-2xl max-h-[85vh] bg-[var(--flux-surface-card)] rounded-[var(--flux-rad-lg)] border border-[var(--flux-border-subtle)] shadow-[var(--flux-shadow-lg)] flex flex-col overflow-hidden pointer-events-auto animate-[cardModalSlideIn_0.3s_ease]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-[var(--flux-border-subtle)]">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[var(--flux-primary-alpha-10)]">
                <IconGoals className="h-5 w-5 text-[var(--flux-primary-light)]" />
              </div>
              <div>
                <h2 className="font-display font-bold text-lg text-[var(--flux-text)]">
                  {t("goals")}
                </h2>
                <p className="text-xs text-[var(--flux-text-muted)]">{currentQuarter}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-05)] hover:text-[var(--flux-text)] transition-colors duration-200"
              aria-label="Close"
            >
              <IconClose className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-sm text-[var(--flux-text-muted)]">Carregando...</div>
              </div>
            ) : !hasObjectives ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="text-sm text-[var(--flux-text-muted)]">
                    Nenhum OKR vinculado a este board no trimestre {currentQuarter}.
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 animate-[fadeIn_0.3s_ease]">
                {computedObjectives.map((row) => {
                  const { objective, keyResults, objectiveCurrentPct } = row;

                  return (
                    <div
                      key={objective.id}
                      className="rounded-[var(--flux-rad-md)] border border-[var(--flux-primary-alpha-15)] bg-[var(--flux-primary-alpha-05)] p-4 hover:border-[var(--flux-primary-alpha-25)] transition-colors duration-200"
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-display font-semibold text-[var(--flux-text)] truncate">
                            {objective.title}
                          </h3>
                          <p className="text-xs text-[var(--flux-text-muted)] mt-1">
                            {objective.owner ? `Owner: ${objective.owner}` : "Sem dono"}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <div className="font-display font-bold text-sm text-[var(--flux-text)]">
                            {objectiveCurrentPct}%
                          </div>
                          <div className="text-[10px] text-[var(--flux-text-muted)]">min dos KRs</div>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="h-1.5 rounded-full bg-[var(--flux-chrome-alpha-08)] overflow-hidden mb-3">
                        <div
                          className="h-full bg-[var(--flux-primary)]"
                          style={{ width: `${objectiveCurrentPct}%` }}
                        />
                      </div>

                      {/* Key Results */}
                      {keyResults.length > 0 && (
                        <div className="space-y-2">
                          {keyResults.map((kr) => {
                            const krId = kr.definition.id;
                            const proj = projections.get(krId);
                            return (
                              <div
                                key={krId}
                                className="rounded-md p-2.5 bg-[var(--flux-surface-elevated)] border border-[var(--flux-chrome-alpha-10)] hover:border-[var(--flux-chrome-alpha-20)] transition-colors duration-200"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs font-semibold text-[var(--flux-text)] truncate">
                                      {kr.definition.title}
                                    </div>
                                    <div className="text-[10px] text-[var(--flux-text-muted)] mt-0.5">
                                      {kr.current} / {kr.definition.target}
                                    </div>
                                  </div>
                                  <div className="flex flex-col items-end gap-1 shrink-0">
                                    <div className="font-display font-bold text-xs text-[var(--flux-text)]">
                                      {kr.pct}%
                                    </div>
                                    {proj && (
                                      <div className="text-[9px] text-[var(--flux-text-muted)]">
                                        proj: ~{proj.projectedPctAtQuarterEnd}%
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {hasObjectives && (
            <div className="border-t border-[var(--flux-border-subtle)] px-6 py-3 flex items-center justify-between bg-[var(--flux-surface-elevated)]">
              <p className="text-xs text-[var(--flux-text-muted)]">
                {computedObjectives.length} objetivo{computedObjectives.length !== 1 ? "s" : ""} para este trimestre
              </p>
              <a
                href="/okrs"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-[var(--flux-primary-light)] hover:text-[var(--flux-primary)] transition-colors duration-200"
              >
                Ver detalhes →
              </a>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
