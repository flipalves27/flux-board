"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { apiGet, ApiError } from "@/lib/api-client";
import { IconGoals, IconClose } from "@/components/sidebar/icons";
import type { OkrKrProjection } from "@/lib/okr-projection";

type Objective = {
  id: string;
  title: string;
  quarter: string;
  owner?: string;
};

type KeyResult = {
  definition: {
    id: string;
    title: string;
    target: number;
    metricType: string;
  };
  current: number;
  pct: number;
  status: string;
};

type OkrData = {
  ok: boolean;
  boardId: string;
  quarter: string | null;
  objectives: Array<{
    objective: Objective;
    keyResults: KeyResult[];
  }>;
};

type BoardGoalsModalProps = {
  boardId: string;
  isOpen: boolean;
  onClose: () => void;
};

export function BoardGoalsModal({ boardId, isOpen, onClose }: BoardGoalsModalProps) {
  const t = useTranslations("navigation");
  const { user, isChecked, getHeaders } = useAuth();
  const [data, setData] = useState<OkrData | null>(null);
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
        const [okrsRes, projRes] = await Promise.all([
          apiGet<OkrData>(
            `/api/okrs/by-board?boardId=${encodeURIComponent(boardId)}&quarter=${encodeURIComponent(currentQuarter)}`,
            getHeaders()
          ),
          apiGet<{ projections?: OkrKrProjection[] }>(
            `/api/okrs/projection?boardId=${encodeURIComponent(boardId)}&quarter=${encodeURIComponent(currentQuarter)}`,
            getHeaders()
          ),
        ]);

        if (!cancelled) {
          setData(okrsRes);
          if (Array.isArray(projRes?.projections)) {
            const projMap = new Map<string, OkrKrProjection>();
            for (const p of projRes.projections) {
              projMap.set(p.keyResultId, p);
            }
            setProjections(projMap);
          }
        }
      } catch {
        if (!cancelled) setData(null);
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

  const hasObjectives = data && data.objectives && data.objectives.length > 0;

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
                  {t("goals") || "Goals"}
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
                {data?.objectives?.map((item) => {
                  const objective = item.objective;
                  const keyResults = item.keyResults || [];
                  const objectiveProgress = keyResults.length > 0
                    ? Math.min(...keyResults.map((kr) => kr.pct))
                    : 0;

                  return (
                    <div
                      key={objective?.id}
                      className="rounded-[var(--flux-rad-md)] border border-[var(--flux-primary-alpha-15)] bg-[var(--flux-primary-alpha-05)] p-4 hover:border-[var(--flux-primary-alpha-25)] transition-colors duration-200"
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-display font-semibold text-[var(--flux-text)] truncate">
                            {objective?.title}
                          </h3>
                          <p className="text-xs text-[var(--flux-text-muted)] mt-1">
                            {objective?.owner ? `Owner: ${objective.owner}` : "Sem dono"}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <div className="font-display font-bold text-sm text-[var(--flux-text)]">
                            {objectiveProgress}%
                          </div>
                          <div className="text-[10px] text-[var(--flux-text-muted)]">
                            min dos KRs
                          </div>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="h-1.5 rounded-full bg-[var(--flux-chrome-alpha-08)] overflow-hidden mb-3">
                        <div
                          className="h-full bg-[var(--flux-primary)]"
                          style={{ width: `${objectiveProgress}%` }}
                        />
                      </div>

                      {/* Key Results */}
                      {keyResults.length > 0 && (
                        <div className="space-y-2">
                          {keyResults.map((kr) => {
                            const proj = projections.get(kr.definition.id);
                            return (
                              <div
                                key={kr.definition.id}
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
          {hasObjectives && data?.objectives && (
            <div className="border-t border-[var(--flux-border-subtle)] px-6 py-3 flex items-center justify-between bg-[var(--flux-surface-elevated)]">
              <p className="text-xs text-[var(--flux-text-muted)]">
                {data.objectives.length} objetivo{data.objectives.length !== 1 ? "s" : ""} para este trimestre
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
