"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { apiGet } from "@/lib/api-client";
import { BoardTemplateExportModal } from "@/components/board/board-template-export-modal";
import {
  MATRIX_GRID_SIZE,
  matrixCellColorHex,
  matrixCellKey,
  matrixCellLabelPt,
  parseMatrixCellKey,
} from "@/lib/matrix-grid4";

type CardRow = { id: string; title: string };

function flattenCellsToSelections(cells: Record<string, string[]>): Array<{ cardId: string; row: number; col: number }> {
  const out: Array<{ cardId: string; row: number; col: number }> = [];
  for (const [key, ids] of Object.entries(cells)) {
    const p = parseMatrixCellKey(key);
    if (!p) continue;
    for (const cardId of ids) {
      out.push({ cardId, row: p.row, col: p.col });
    }
  }
  return out;
}

type Props = {
  getHeaders: () => Record<string, string>;
  isAdmin: boolean;
};

export function PriorityMatrixWorkspace({ getHeaders, isAdmin }: Props) {
  const t = useTranslations("templates");
  const [boards, setBoards] = useState<{ id: string; name: string }[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(true);
  const [selectedBoardId, setSelectedBoardId] = useState("");
  const [cards, setCards] = useState<CardRow[]>([]);
  const [loadingCards, setLoadingCards] = useState(false);
  const [cells, setCells] = useState<Record<string, string[]>>({});
  const [publishOpen, setPublishOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingBoards(true);
      try {
        const data = await apiGet<{ boards: { id: string; name: string }[] }>("/api/boards", getHeaders());
        if (!cancelled) {
          const list = data?.boards ?? [];
          setBoards(list);
          setSelectedBoardId((prev) => (prev && list.some((b) => b.id === prev) ? prev : list[0]?.id ?? ""));
        }
      } catch {
        if (!cancelled) {
          setBoards([]);
          setSelectedBoardId("");
        }
      } finally {
        if (!cancelled) setLoadingBoards(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getHeaders]);

  useEffect(() => {
    if (!selectedBoardId) {
      setCards([]);
      return;
    }
    let cancelled = false;
    setLoadingCards(true);
    setCells({});
    (async () => {
      try {
        const data = await apiGet<{ cards?: unknown }>(`/api/boards/${encodeURIComponent(selectedBoardId)}`, getHeaders());
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
      } catch {
        if (!cancelled) setCards([]);
      } finally {
        if (!cancelled) setLoadingCards(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedBoardId, getHeaders]);

  const assignedIds = useMemo(() => {
    const s = new Set<string>();
    for (const ids of Object.values(cells)) {
      for (const id of ids) s.add(id);
    }
    return s;
  }, [cells]);

  const poolCards = useMemo(() => cards.filter((c) => !assignedIds.has(c.id)), [cards, assignedIds]);

  const gridSelections = useMemo(() => flattenCellsToSelections(cells), [cells]);

  const moveCardToCell = useCallback((cardId: string, cellKey: string) => {
    setCells((prev) => {
      const next: Record<string, string[]> = { ...prev };
      for (const k of Object.keys(next)) {
        next[k] = next[k]!.filter((id) => id !== cardId);
        if (next[k]!.length === 0) delete next[k];
      }
      const cur = next[cellKey] ?? [];
      if (!cur.includes(cardId)) next[cellKey] = [...cur, cardId];
      return next;
    });
  }, []);

  const removeCardFromCells = useCallback((cardId: string) => {
    setCells((prev) => {
      const next: Record<string, string[]> = { ...prev };
      for (const k of Object.keys(next)) {
        next[k] = next[k]!.filter((id) => id !== cardId);
        if (next[k]!.length === 0) delete next[k];
      }
      return next;
    });
  }, []);

  const onDragStartCard = useCallback((e: React.DragEvent, cardId: string) => {
    e.dataTransfer.setData("text/plain", cardId);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const onDragStartPlaced = useCallback((e: React.DragEvent, cardId: string, fromCellKey: string) => {
    e.dataTransfer.setData("text/plain", cardId);
    e.dataTransfer.setData("application/x-flux-from-cell", fromCellKey);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const onDropCell = useCallback(
    (e: React.DragEvent, cellKey: string) => {
      e.preventDefault();
      const cardId = e.dataTransfer.getData("text/plain");
      const fromCell = e.dataTransfer.getData("application/x-flux-from-cell");
      if (!cardId) return;
      if (fromCell) {
        setCells((prev) => {
          const next: Record<string, string[]> = { ...prev };
          const from = next[fromCell];
          if (from) {
            next[fromCell] = from.filter((id) => id !== cardId);
            if (next[fromCell]!.length === 0) delete next[fromCell];
          }
          const cur = next[cellKey] ?? [];
          if (!cur.includes(cardId)) next[cellKey] = [...cur, cardId];
          return next;
        });
      } else {
        moveCardToCell(cardId, cellKey);
      }
    },
    [moveCardToCell]
  );

  const onDropPool = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData("text/plain");
    const fromCell = e.dataTransfer.getData("application/x-flux-from-cell");
    if (!cardId || !fromCell) return;
    removeCardFromCells(cardId);
  }, [removeCardFromCells]);

  const rows = Array.from({ length: MATRIX_GRID_SIZE }, (_, r) => r);
  const cols = Array.from({ length: MATRIX_GRID_SIZE }, (_, c) => c);

  return (
    <div className="space-y-6 max-w-5xl">
      <p className="text-sm text-[var(--flux-text-muted)] leading-relaxed">{t("matrixWorkspace.intro")}</p>

      {loadingBoards ? (
        <p className="text-xs text-[var(--flux-text-muted)]">{t("matrixPanel.loadingBoards")}</p>
      ) : boards.length === 0 ? (
        <p className="text-xs text-[var(--flux-text-muted)]">{t("matrixPanel.noBoards")}</p>
      ) : (
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-[var(--flux-text-muted)]">{t("matrixPanel.selectBoard")}</label>
          <select
            value={selectedBoardId}
            onChange={(e) => setSelectedBoardId(e.target.value)}
            className="w-full max-w-md px-3 py-2 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-sm"
          >
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedBoardId && (
        <>
          {loadingCards ? (
            <p className="text-xs text-[var(--flux-text-muted)]">{t("matrixWorkspace.loadingCards")}</p>
          ) : (
            <>
              <div
                className="rounded-[var(--flux-rad-xl)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]/40 p-4 sm:p-6 overflow-x-auto"
                aria-label={t("matrixWorkspace.gridAria")}
              >
                <div className="min-w-[320px] sm:min-w-[480px]">
                  <div className="flex justify-center items-center gap-2 mb-2 text-[11px] font-semibold text-[var(--flux-text-muted)]">
                    <span className="opacity-70">←</span>
                    <span>{t("matrixWorkspace.axisHorizontalLow")}</span>
                    <span className="px-2 py-0.5 rounded-md bg-[var(--flux-chrome-alpha-08)]">{t("matrixWorkspace.level")}</span>
                    <span>{t("matrixWorkspace.axisHorizontalHigh")}</span>
                    <span className="opacity-70">→</span>
                  </div>

                  <div className="flex gap-3">
                    <div className="flex flex-col justify-between items-center py-1 w-10 shrink-0 text-[10px] font-semibold text-[var(--flux-text-muted)] select-none min-h-[200px] sm:min-h-[260px]">
                      <span>{t("matrixWorkspace.axisVerticalHigh")}</span>
                      <span className="text-[9px] text-center opacity-85 leading-tight px-0.5">{t("matrixWorkspace.level")}</span>
                      <span>{t("matrixWorkspace.axisVerticalLow")}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="grid grid-cols-4 gap-2 sm:gap-2.5">
                        {rows.map((row) =>
                          cols.map((col) => {
                            const key = matrixCellKey(row, col);
                            const bg = matrixCellColorHex(row, col);
                            const placed = cells[key] ?? [];
                            return (
                              <div
                                key={key}
                                className="rounded-2xl border border-white/25 min-h-[76px] sm:min-h-[96px] flex flex-col p-1.5 shadow-inner transition-shadow hover:border-white/40"
                                style={{ backgroundColor: bg }}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => onDropCell(e, key)}
                              >
                                <span className="text-[9px] font-semibold text-white/90 truncate px-0.5" title={matrixCellLabelPt(row, col)}>
                                  {matrixCellLabelPt(row, col)}
                                </span>
                                <div className="flex flex-col gap-1 mt-1 flex-1 overflow-y-auto max-h-[120px]">
                                  {placed.map((cid) => {
                                    const c = cards.find((x) => x.id === cid);
                                    return (
                                      <button
                                        key={cid}
                                        type="button"
                                        draggable
                                        onDragStart={(e) => onDragStartPlaced(e, cid, key)}
                                        className="text-left text-[10px] leading-snug rounded-lg bg-black/25 hover:bg-black/35 text-white px-1.5 py-1 border border-white/20 truncate cursor-grab active:cursor-grabbing"
                                        title={c?.title ?? cid}
                                      >
                                        {c?.title ?? cid}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-[var(--flux-text-muted)] mb-2">{t("matrixWorkspace.poolTitle")}</p>
                <div
                  className="min-h-[72px] rounded-[var(--flux-rad-lg)] border-2 border-dashed border-[var(--flux-chrome-alpha-20)] bg-[var(--flux-surface-dark)]/40 p-3 flex flex-wrap gap-2"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={onDropPool}
                >
                  {poolCards.length === 0 ? (
                    <span className="text-[11px] text-[var(--flux-text-muted)]">{t("matrixWorkspace.poolEmpty")}</span>
                  ) : (
                    poolCards.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        draggable
                        onDragStart={(e) => onDragStartCard(e, c.id)}
                        className="text-[11px] rounded-lg px-2 py-1.5 bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-[var(--flux-text)] max-w-[200px] truncate cursor-grab active:cursor-grabbing hover:border-[var(--flux-primary-alpha-40)]"
                        title={c.title}
                      >
                        {c.title}
                      </button>
                    ))
                  )}
                </div>
                <p className="text-[10px] text-[var(--flux-text-muted)] mt-2">{t("matrixWorkspace.dragHint")}</p>
              </div>
            </>
          )}
        </>
      )}

      {isAdmin ? (
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[var(--flux-chrome-alpha-08)]">
          <button
            type="button"
            className="btn-primary"
            disabled={!selectedBoardId || loadingCards}
            onClick={() => setPublishOpen(true)}
          >
            {t("matrixWorkspace.publishCta")}
          </button>
          <span className="text-[11px] text-[var(--flux-text-muted)]">{t("matrixWorkspace.publishHint")}</span>
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
        defaultTemplateKind="priority_matrix"
        grid4PublishSelections={publishOpen ? gridSelections : undefined}
      />
    </div>
  );
}
