"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ApiError, apiGet, apiPut } from "@/lib/api-client";
import { nextBoardCardId } from "@/lib/card-id";
import { BoardTemplateExportModal } from "@/components/board/board-template-export-modal";
import type { SwotQuadrantKey } from "@/lib/template-types";

type BoardRow = { id: string; name: string };
type BoardCard = {
  id: string;
  bucket: string;
  priority: string;
  progress: string;
  title: string;
  desc: string;
  order: number;
  tags?: string[];
  dueDate?: string | null;
  blockedBy?: string[];
};

const QUADRANTS: Array<{ key: SwotQuadrantKey; label: string; hint: string }> = [
  { key: "strengths", label: "Strengths", hint: "Internal advantages" },
  { key: "weaknesses", label: "Weaknesses", hint: "Internal gaps" },
  { key: "opportunities", label: "Opportunities", hint: "External openings" },
  { key: "threats", label: "Threats", hint: "External risks" },
];

type Props = {
  getHeaders: () => Record<string, string>;
  isAdmin: boolean;
};

export function SwotWorkspace({ getHeaders, isAdmin }: Props) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("templates");
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(true);
  const [selectedBoardId, setSelectedBoardId] = useState("");
  const [cards, setCards] = useState<BoardCard[]>([]);
  const [defaultBucketKey, setDefaultBucketKey] = useState("");
  const [loadingCards, setLoadingCards] = useState(false);
  const [savingCard, setSavingCard] = useState(false);
  const [newInsightTitle, setNewInsightTitle] = useState("");
  const [newInsightQuadrant, setNewInsightQuadrant] = useState<SwotQuadrantKey>("strengths");
  const [error, setError] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [selections, setSelections] = useState<Record<string, { quadrantKey: SwotQuadrantKey; evidence: string }>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingBoards(true);
      try {
        const data = await apiGet<{ boards: BoardRow[] }>("/api/boards", getHeaders());
        if (!cancelled) {
          const list = data?.boards ?? [];
          setBoards(list);
          setSelectedBoardId((prev) => (prev && list.some((b) => b.id === prev) ? prev : list[0]?.id ?? ""));
        }
      } catch {
        if (!cancelled) setBoards([]);
      } finally {
        if (!cancelled) setLoadingBoards(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getHeaders]);

  const loadCards = useCallback(async () => {
    if (!selectedBoardId) {
      setCards([]);
      setDefaultBucketKey("");
      return;
    }
    setLoadingCards(true);
    setError(null);
    try {
      const data = await apiGet<{ cards?: unknown; config?: { bucketOrder?: Array<{ key?: string }> } }>(
        `/api/boards/${encodeURIComponent(selectedBoardId)}`,
        getHeaders()
      );
      const parsed: BoardCard[] = [];
      for (const item of Array.isArray(data?.cards) ? data.cards : []) {
        if (!item || typeof item !== "object") continue;
        const rec = item as Record<string, unknown>;
        const id = typeof rec.id === "string" ? rec.id : "";
        const bucket = typeof rec.bucket === "string" ? rec.bucket : "";
        if (!id || !bucket) continue;
        parsed.push({
          id,
          bucket,
          priority: typeof rec.priority === "string" ? rec.priority : "Média",
          progress: typeof rec.progress === "string" ? rec.progress : "Não iniciado",
          title: typeof rec.title === "string" && rec.title.trim() ? rec.title.trim() : id,
          desc: typeof rec.desc === "string" ? rec.desc : "",
          order: typeof rec.order === "number" ? rec.order : 0,
          tags: Array.isArray(rec.tags) ? (rec.tags as string[]) : [],
          dueDate: rec.dueDate === null || typeof rec.dueDate === "string" ? rec.dueDate : null,
          blockedBy: Array.isArray(rec.blockedBy) ? (rec.blockedBy as string[]) : [],
        });
      }
      setCards(parsed);
      const bucket = data?.config?.bucketOrder?.find((b) => typeof b.key === "string" && b.key)?.key ?? parsed[0]?.bucket ?? "";
      setDefaultBucketKey(bucket);
    } catch (e) {
      setCards([]);
      setDefaultBucketKey("");
      setError(e instanceof ApiError ? e.message : t("swotWorkspace.loadError"));
    } finally {
      setLoadingCards(false);
    }
  }, [selectedBoardId, getHeaders, t]);

  useEffect(() => {
    void loadCards();
  }, [loadCards]);

  const publishSelections = useMemo(
    () =>
      Object.entries(selections).map(([cardId, value]) => ({
        cardId,
        quadrantKey: value.quadrantKey,
        evidence: value.evidence.trim() || undefined,
      })),
    [selections]
  );

  const selectedIds = useMemo(() => new Set(Object.keys(selections)), [selections]);

  async function createInsight() {
    const title = newInsightTitle.trim();
    if (!title || !selectedBoardId || !defaultBucketKey) return;
    setSavingCard(true);
    setError(null);
    try {
      const id = nextBoardCardId(cards.map((card) => card.id));
      const maxOrder = cards.filter((card) => card.bucket === defaultBucketKey).reduce((acc, card) => Math.max(acc, card.order ?? 0), -1);
      const nextCard: BoardCard = {
        id,
        title,
        bucket: defaultBucketKey,
        priority: "Média",
        progress: "Não iniciado",
        desc: "",
        tags: ["SWOT", newInsightQuadrant],
        blockedBy: [],
        dueDate: null,
        order: maxOrder + 1,
      };
      const nextCards = [...cards, nextCard];
      await apiPut(`/api/boards/${encodeURIComponent(selectedBoardId)}`, { cards: nextCards, lastUpdated: new Date().toISOString() }, getHeaders());
      setCards(nextCards);
      setSelections((prev) => ({ ...prev, [id]: { quadrantKey: newInsightQuadrant, evidence: "" } }));
      setNewInsightTitle("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("swotWorkspace.saveError"));
    } finally {
      setSavingCard(false);
    }
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="rounded-[var(--flux-rad-lg)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]/40 p-4">
        <p className="text-sm text-[var(--flux-text-muted)] leading-relaxed">{t("swotWorkspace.intro")}</p>
        <p className="text-[11px] text-[var(--flux-text-muted)] mt-2">{t("swotWorkspace.bestPracticeHint")}</p>
      </div>

      {loadingBoards ? (
        <p className="text-xs text-[var(--flux-text-muted)]">{t("matrixPanel.loadingBoards")}</p>
      ) : boards.length === 0 ? (
        <p className="text-xs text-[var(--flux-text-muted)]">{t("matrixPanel.noBoards")}</p>
      ) : (
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-[var(--flux-text-muted)]">{t("matrixPanel.selectBoard")}</label>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedBoardId}
              onChange={(e) => {
                setSelectedBoardId(e.target.value);
                setSelections({});
              }}
              className="w-full max-w-md px-3 py-2 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-sm"
            >
              {boards.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.name}
                </option>
              ))}
            </select>
            <button type="button" className="btn-secondary" disabled={!selectedBoardId} onClick={() => router.push(`/${locale}/board/${encodeURIComponent(selectedBoardId)}`)}>
              {t("matrixWorkspace.openBoardCta")}
            </button>
          </div>
        </div>
      )}

      {selectedBoardId ? (
        loadingCards ? (
          <p className="text-xs text-[var(--flux-text-muted)]">{t("swotWorkspace.loadingCards")}</p>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {QUADRANTS.map((q) => {
                  const items = Object.entries(selections)
                    .filter(([, value]) => value.quadrantKey === q.key)
                    .map(([id]) => cards.find((card) => card.id === id))
                    .filter(Boolean) as BoardCard[];
                  return (
                    <section key={q.key} className="rounded-[var(--flux-rad-xl)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] p-3 min-h-[180px]">
                      <h3 className="text-sm font-semibold text-[var(--flux-text)]">{q.label}</h3>
                      <p className="text-[11px] text-[var(--flux-text-muted)] mb-3">{q.hint}</p>
                      <div className="space-y-2">
                        {items.length === 0 ? (
                          <p className="text-xs text-[var(--flux-text-muted)]">{t("swotWorkspace.emptyQuadrant")}</p>
                        ) : (
                          items.map((card) => (
                            <button key={card.id} type="button" className="w-full text-left rounded-[var(--flux-rad)] border border-[var(--flux-control-border)] px-2 py-1.5 text-xs" onClick={() => setSelections((prev) => {
                              const next = { ...prev };
                              delete next[card.id];
                              return next;
                            })}>
                              {card.title}
                            </button>
                          ))
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>

              <aside className="rounded-[var(--flux-rad-xl)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] p-3">
                <h3 className="text-sm font-semibold text-[var(--flux-text)] mb-2">{t("swotWorkspace.cardPool")}</h3>
                <div className="max-h-[420px] overflow-y-auto space-y-2">
                  {cards.map((card) => (
                    <div key={card.id} className="rounded-[var(--flux-rad)] border border-[var(--flux-control-border)] p-2">
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(card.id)}
                          onChange={(e) => {
                            setSelections((prev) => {
                              const next = { ...prev };
                              if (e.target.checked) next[card.id] = { quadrantKey: "strengths", evidence: "" };
                              else delete next[card.id];
                              return next;
                            });
                          }}
                        />
                        <span className="font-medium text-[var(--flux-text)] line-clamp-2">{card.title}</span>
                      </label>
                      {selections[card.id] ? (
                        <div className="mt-2 space-y-2">
                          <select
                            value={selections[card.id].quadrantKey}
                            onChange={(e) =>
                              setSelections((prev) => {
                                const current = prev[card.id] ?? { quadrantKey: "strengths" as SwotQuadrantKey, evidence: "" };
                                return { ...prev, [card.id]: { ...current, quadrantKey: e.target.value as SwotQuadrantKey } };
                              })
                            }
                            className="w-full px-2 py-1 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-xs"
                          >
                            {QUADRANTS.map((q) => (
                              <option key={q.key} value={q.key}>
                                {q.label}
                              </option>
                            ))}
                          </select>
                          <input
                            value={selections[card.id].evidence}
                            onChange={(e) =>
                              setSelections((prev) => {
                                const current = prev[card.id] ?? { quadrantKey: "strengths" as SwotQuadrantKey, evidence: "" };
                                return { ...prev, [card.id]: { ...current, evidence: e.target.value } };
                              })
                            }
                            placeholder={t("swotWorkspace.evidencePlaceholder")}
                            className="w-full px-2 py-1 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-xs"
                          />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </aside>
            </div>

            <div className="rounded-[var(--flux-rad-lg)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]/40 p-3 space-y-2">
              <p className="text-xs font-semibold text-[var(--flux-text-muted)]">{t("swotWorkspace.quickInsightTitle")}</p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={newInsightTitle}
                  onChange={(e) => setNewInsightTitle(e.target.value)}
                  placeholder={t("swotWorkspace.quickInsightPlaceholder")}
                  className="flex-1 min-w-[220px] px-3 py-2 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-sm"
                />
                <select
                  value={newInsightQuadrant}
                  onChange={(e) => setNewInsightQuadrant(e.target.value as SwotQuadrantKey)}
                  className="px-3 py-2 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-sm"
                >
                  {QUADRANTS.map((q) => (
                    <option key={q.key} value={q.key}>
                      {q.label}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn-secondary" disabled={!newInsightTitle.trim() || savingCard} onClick={() => void createInsight()}>
                  {savingCard ? t("matrixWorkspace.savingTask") : t("swotWorkspace.quickInsightCta")}
                </button>
              </div>
              {error ? <p className="text-[11px] text-[var(--flux-danger)]">{error}</p> : null}
            </div>
          </>
        )
      ) : null}

      {isAdmin ? (
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[var(--flux-chrome-alpha-08)]">
          <button type="button" className="btn-primary" disabled={!selectedBoardId || loadingCards || publishSelections.length === 0} onClick={() => setPublishOpen(true)}>
            {t("swotWorkspace.publishCta")}
          </button>
          <span className="text-[11px] text-[var(--flux-text-muted)]">{t("swotWorkspace.publishHint")}</span>
        </div>
      ) : (
        <div className="pt-2 border-t border-[var(--flux-chrome-alpha-08)] space-y-2">
          <p className="text-sm text-[var(--flux-text-muted)]">{t("matrixPanel.nonAdmin")}</p>
          <p className="text-xs text-[var(--flux-text-muted)] leading-relaxed">{t("matrixPanel.nonAdminHint")}</p>
        </div>
      )}

      <BoardTemplateExportModal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        boardId={selectedBoardId}
        getHeaders={getHeaders}
        defaultTemplateKind="swot"
        swotPublishSelections={publishOpen ? publishSelections : undefined}
      />
    </div>
  );
}
