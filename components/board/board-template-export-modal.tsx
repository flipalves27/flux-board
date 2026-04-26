"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import type { PriorityMatrixQuadrantKey, SwotQuadrantKey, TemplateCategory } from "@/lib/template-types";
import { PRIORITY_MATRIX_QUADRANT_KEYS } from "@/lib/template-types";

const CATEGORIES: TemplateCategory[] = [
  "sales",
  "operations",
  "projects",
  "hr",
  "marketing",
  "customer_success",
  "support",
  "insurance_warranty",
];

type BoardRow = { id: string; name: string };
type CardRow = { id: string; title: string };

type Props = {
  open: boolean;
  onClose: () => void;
  boardId: string;
  getHeaders: () => Record<string, string>;
  /** Pré-seleciona o tipo ao abrir (padrão: kanban). */
  defaultTemplateKind?: "kanban" | "priority_matrix" | "bpmn" | "swot";
  /** Se definido, publica matriz 4×4 (payload do workspace); não exige lista Eisenhower no modal. */
  grid4PublishSelections?: Array<{ cardId: string; row: number; col: number }>;
  /** Se definido, publica Eisenhower com seleções prontas do workspace. */
  eisenhowerPublishSelections?: Array<{ cardId: string; quadrantKey: PriorityMatrixQuadrantKey }>;
  /** Se definido, publica SWOT com seleções prontas do workspace. */
  swotPublishSelections?: Array<{ cardId: string; quadrantKey: SwotQuadrantKey; evidence?: string }>;
};

export function BoardTemplateExportModal({
  open,
  onClose,
  boardId,
  getHeaders,
  defaultTemplateKind = "kanban",
  grid4PublishSelections,
  eisenhowerPublishSelections,
  swotPublishSelections,
}: Props) {
  const isGrid4PublishMode = grid4PublishSelections !== undefined;
  const isEisenhowerPublishMode = eisenhowerPublishSelections !== undefined;
  const isSwotPublishMode = swotPublishSelections !== undefined;
  const t = useTranslations("templates");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TemplateCategory>("operations");
  const [pricingTier, setPricingTier] = useState<"free" | "premium">("free");
  const [templateKind, setTemplateKind] = useState<"kanban" | "priority_matrix" | "bpmn" | "swot">("kanban");
  const [sourceBoardId, setSourceBoardId] = useState(boardId);
  const [boardRows, setBoardRows] = useState<BoardRow[]>([]);
  const [cards, setCards] = useState<CardRow[]>([]);
  const [boardsLoading, setBoardsLoading] = useState(false);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [cardSearch, setCardSearch] = useState("");
  /** cardId -> quadrant when publishing matrix */
  const [matrixSelections, setMatrixSelections] = useState<Partial<Record<string, PriorityMatrixQuadrantKey>>>({});
  const [phase, setPhase] = useState<"idle" | "publishing" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSourceBoardId(boardId);
    setTemplateKind(isGrid4PublishMode || isEisenhowerPublishMode ? "priority_matrix" : isSwotPublishMode ? "swot" : defaultTemplateKind);
    setMatrixSelections({});
    setCardSearch("");
    setError(null);
    setPhase("idle");
    setPublishedSlug(null);
  }, [open, boardId, defaultTemplateKind, isGrid4PublishMode, isEisenhowerPublishMode, isSwotPublishMode]);

  useEffect(() => {
    if (templateKind === "kanban") setError(null);
  }, [templateKind]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBoardsLoading(true);
    (async () => {
      try {
        const data = await apiGet<{ boards: BoardRow[] }>("/api/boards", getHeaders());
        if (!cancelled) setBoardRows(data?.boards ?? []);
      } catch {
        if (!cancelled) setBoardRows([]);
      } finally {
        if (!cancelled) setBoardsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, getHeaders]);

  useEffect(() => {
    if (!open || boardRows.length === 0) return;
    if (!boardRows.some((b) => b.id === sourceBoardId)) {
      setSourceBoardId(boardRows.find((b) => b.id === boardId)?.id ?? boardRows[0].id);
    }
  }, [open, boardRows, boardId, sourceBoardId]);

  useEffect(() => {
    if (!open || isGrid4PublishMode || isEisenhowerPublishMode || templateKind !== "priority_matrix" || !sourceBoardId) return;
    let cancelled = false;
    setCardsLoading(true);
    setCards([]);
    setMatrixSelections({});
    setCardSearch("");
    (async () => {
      try {
        const data = await apiGet<{ cards?: unknown }>(
          `/api/boards/${encodeURIComponent(sourceBoardId)}`,
          getHeaders()
        );
        if (cancelled) return;
        const raw = Array.isArray(data?.cards) ? data.cards : [];
        const parsed: CardRow[] = [];
        for (const c of raw) {
          if (!c || typeof c !== "object") continue;
          const rec = c as Record<string, unknown>;
          const id = typeof rec.id === "string" ? rec.id : "";
          const titleStr = typeof rec.title === "string" ? rec.title.trim() : "";
          if (id) parsed.push({ id, title: titleStr || id });
        }
        setCards(parsed);
        setError(null);
      } catch {
        if (!cancelled) {
          setCards([]);
          setError(t("exportModal.boardLoadError"));
        }
      } finally {
        if (!cancelled) setCardsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, isGrid4PublishMode, isEisenhowerPublishMode, templateKind, sourceBoardId, getHeaders, t]);

  const filteredCards = useMemo(() => {
    const q = cardSearch.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((c) => c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
  }, [cards, cardSearch]);

  if (!open) return null;

  async function publish() {
    setError(null);
    setPhase("publishing");
    try {
      const base: Record<string, unknown> = {
        title: title.trim() || "Template",
        description: description.trim(),
        category,
        pricingTier,
      };
      const targetBoardId = isGrid4PublishMode || templateKind === "priority_matrix" || templateKind === "swot" ? sourceBoardId : boardId;
      if (isGrid4PublishMode) {
        base.templateKind = "priority_matrix";
        base.priorityMatrixModel = "grid4";
        base.priorityMatrixGridSelections = grid4PublishSelections ?? [];
      } else if (isEisenhowerPublishMode) {
        base.templateKind = "priority_matrix";
        base.priorityMatrixModel = "eisenhower";
        base.priorityMatrixSelections = eisenhowerPublishSelections ?? [];
      } else if (templateKind === "priority_matrix") {
        base.templateKind = "priority_matrix";
        base.priorityMatrixModel = "eisenhower";
        base.priorityMatrixSelections = Object.entries(matrixSelections)
          .filter((entry): entry is [string, PriorityMatrixQuadrantKey] => Boolean(entry[1]))
          .map(([cardId, quadrantKey]) => ({ cardId, quadrantKey }));
      } else if (templateKind === "bpmn") {
        base.templateKind = "bpmn";
      } else if (templateKind === "swot") {
        base.templateKind = "swot";
        base.swotSelections = swotPublishSelections ?? [];
      } else {
        base.templateKind = "kanban";
      }

      const res = await apiPost<{ template: { slug: string } }>(
        `/api/boards/${encodeURIComponent(targetBoardId)}/export-template`,
        base,
        getHeaders()
      );
      setPublishedSlug(res?.template?.slug ?? null);
      setPhase("done");
    } catch (e) {
      setPhase("idle");
      setError(e instanceof ApiError ? e.message : t("exportModal.publishError"));
    }
  }

  const hint = isGrid4PublishMode
    ? t("exportModal.hintGrid4Publish")
    : isEisenhowerPublishMode
      ? t("exportModal.hintMatrix")
    : isSwotPublishMode || templateKind === "swot"
      ? t("exportModal.hintSwot")
    : templateKind === "priority_matrix"
      ? t("exportModal.hintMatrix")
      : t("exportModal.hint");

  return (
    <div
      className="fixed inset-0 z-[var(--flux-z-modal-critical)] flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal
    >
      <div
        className={`w-full ${templateKind === "priority_matrix" && !isGrid4PublishMode ? "max-w-2xl" : "max-w-lg"} my-8 rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-25)] bg-[var(--flux-surface-card)] shadow-[0_20px_50px_var(--flux-black-alpha-45)] p-6`}
      >
        <h2 className="text-lg font-semibold text-[var(--flux-text)] font-display">{t("exportModal.title")}</h2>
        <p className="text-sm text-[var(--flux-text-muted)] mt-1 mb-4">{hint}</p>
        {isGrid4PublishMode && grid4PublishSelections && (
          <p className="text-xs text-[var(--flux-secondary)] mb-4 font-medium">
            {t("exportModal.grid4Summary", { count: grid4PublishSelections.length })}
          </p>
        )}

        {error && (
          <div className="mb-3 text-sm text-[var(--flux-danger)] border border-[var(--flux-danger-alpha-35)] rounded-[var(--flux-rad)] px-3 py-2">
            {error}
          </div>
        )}

        {phase === "done" ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--flux-secondary)]">{t("exportModal.done")}</p>
            {publishedSlug && (
              <p className="text-xs text-[var(--flux-text-muted)] font-mono break-all">
                slug: {publishedSlug}
              </p>
            )}
            <button type="button" className="btn-primary w-full" onClick={onClose}>
              OK
            </button>
          </div>
        ) : (
          <>
            {!isGrid4PublishMode && !isEisenhowerPublishMode && !isSwotPublishMode && (
              <>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">
                  {t("exportModal.templateKind")}
                </label>
                <div className="flex flex-wrap gap-3 mb-3">
                  <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="tplKind"
                      checked={templateKind === "kanban"}
                      onChange={() => setTemplateKind("kanban")}
                      className="rounded-full"
                    />
                    {t("exportModal.templateKindKanban")}
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="tplKind"
                      checked={templateKind === "priority_matrix"}
                      onChange={() => setTemplateKind("priority_matrix")}
                      className="rounded-full"
                    />
                    {t("exportModal.templateKindMatrix")}
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="tplKind"
                      checked={templateKind === "bpmn"}
                      onChange={() => setTemplateKind("bpmn")}
                      className="rounded-full"
                    />
                    {t("exportModal.templateKindBpmn")}
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="tplKind"
                      checked={templateKind === "swot"}
                      onChange={() => setTemplateKind("swot")}
                      className="rounded-full"
                    />
                    {t("exportModal.templateKindSwot")}
                  </label>
                </div>
              </>
            )}

            {!isGrid4PublishMode && !isEisenhowerPublishMode && templateKind === "priority_matrix" && (
              <div className="mb-4 space-y-2">
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)]">
                  {t("exportModal.sourceBoard")}
                </label>
                <select
                  value={sourceBoardId}
                  onChange={(e) => {
                    setSourceBoardId(e.target.value);
                    setError(null);
                  }}
                  disabled={boardsLoading}
                  className="w-full px-3 py-2 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-sm"
                >
                  {boardRows.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                {cardsLoading ? (
                  <p className="text-xs text-[var(--flux-text-muted)]">{t("exportModal.loadingCards")}</p>
                ) : cards.length === 0 ? (
                  <p className="text-xs text-[var(--flux-text-muted)]">{t("exportModal.noCards")}</p>
                ) : (
                  <>
                    <input
                      value={cardSearch}
                      onChange={(e) => setCardSearch(e.target.value)}
                      placeholder={t("exportModal.cardSearch")}
                      className="w-full px-3 py-2 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-sm"
                    />
                    <p className="text-xs font-semibold text-[var(--flux-text-muted)] mt-2">
                      {t("exportModal.cardsHeading")}
                    </p>
                    <div className="max-h-48 overflow-y-auto rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] divide-y divide-[var(--flux-chrome-alpha-08)]">
                      {filteredCards.map((c) => (
                        <div key={c.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-2 py-2 text-sm">
                          <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={Boolean(matrixSelections[c.id])}
                              onChange={(e) => {
                                setMatrixSelections((prev) => {
                                  const next = { ...prev };
                                  if (e.target.checked) {
                                    next[c.id] = "do_first";
                                  } else {
                                    delete next[c.id];
                                  }
                                  return next;
                                });
                              }}
                            />
                            <span className="truncate" title={c.title}>
                              {c.title}
                            </span>
                          </label>
                          {matrixSelections[c.id] ? (
                            <select
                              value={matrixSelections[c.id]}
                              onChange={(e) =>
                                setMatrixSelections((prev) => ({
                                  ...prev,
                                  [c.id]: e.target.value as PriorityMatrixQuadrantKey,
                                }))
                              }
                              className="shrink-0 px-2 py-1 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-xs max-w-full"
                            >
                              {PRIORITY_MATRIX_QUADRANT_KEYS.map((k) => (
                                <option key={k} value={k}>
                                  {t(`exportModal.quadrants.${k}`)}
                                </option>
                              ))}
                            </select>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">{t("exportModal.fieldTitle")}</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full mb-3 px-3 py-2 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-sm"
              placeholder={t("exportModal.titlePlaceholder")}
            />
            <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">{t("exportModal.fieldDesc")}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full mb-3 px-3 py-2 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-sm"
            />
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">{t("exportModal.category")}</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TemplateCategory)}
                  className="w-full px-3 py-2 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-sm"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`exportModal.categories.${c}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">{t("exportModal.pricing")}</label>
                <select
                  value={pricingTier}
                  onChange={(e) => setPricingTier(e.target.value as "free" | "premium")}
                  className="w-full px-3 py-2 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-sm"
                >
                  <option value="free">{t("exportModal.free")}</option>
                  <option value="premium">{t("exportModal.premium")}</option>
                </select>
              </div>
            </div>
            <p className="text-[11px] text-[var(--flux-text-muted)] mb-4">{t("exportModal.revenueHint")}</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={phase === "publishing"}>
                {t("exportModal.cancel")}
              </button>
              <button type="button" className="btn-primary" onClick={() => void publish()} disabled={phase === "publishing"}>
                {phase === "publishing" ? t("exportModal.publishing") : t("exportModal.publish")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
