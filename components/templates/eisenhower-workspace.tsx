"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api-client";
import { BoardTemplateExportModal } from "@/components/board/board-template-export-modal";
import type { PriorityMatrixQuadrantKey } from "@/lib/template-types";

type CardRow = { id: string; title: string; bucket: string; order: number };
type QuadrantDef = { key: PriorityMatrixQuadrantKey; label: string };

const QUADRANTS: QuadrantDef[] = [
  { key: "do_first", label: "Do first" },
  { key: "schedule", label: "Schedule" },
  { key: "delegate", label: "Delegate" },
  { key: "eliminate", label: "Delete" },
];

type Props = {
  getHeaders: () => Record<string, string>;
  isAdmin: boolean;
};

export function EisenhowerWorkspace({ getHeaders, isAdmin }: Props) {
  const locale = useLocale();
  const [boards, setBoards] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedBoardId, setSelectedBoardId] = useState("");
  const [cards, setCards] = useState<CardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [inboxTitle, setInboxTitle] = useState("");
  const [publishOpen, setPublishOpen] = useState(false);
  const [selectedByCard, setSelectedByCard] = useState<Partial<Record<string, PriorityMatrixQuadrantKey>>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await apiGet<{ boards: { id: string; name: string }[] }>("/api/boards", getHeaders()).catch(() => ({
        boards: [],
      }));
      if (cancelled) return;
      setBoards(data.boards ?? []);
      setSelectedBoardId((data.boards ?? [])[0]?.id ?? "");
    })();
    return () => {
      cancelled = true;
    };
  }, [getHeaders]);

  const reloadCards = useCallback(async () => {
    if (!selectedBoardId) return;
    setLoading(true);
    const data = await apiGet<{ cards?: unknown }>(`/api/boards/${encodeURIComponent(selectedBoardId)}`, getHeaders()).catch(
      () => ({ cards: [] })
    );
    const parsed: CardRow[] = [];
    for (const item of Array.isArray(data.cards) ? data.cards : []) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const id = typeof rec.id === "string" ? rec.id : "";
      const title = typeof rec.title === "string" && rec.title.trim() ? rec.title.trim() : id;
      const bucket = typeof rec.bucket === "string" ? rec.bucket : "";
      if (!id || !bucket) continue;
      parsed.push({ id, title, bucket, order: typeof rec.order === "number" ? rec.order : 0 });
    }
    setCards(parsed);
    setLoading(false);
  }, [getHeaders, selectedBoardId]);

  useEffect(() => {
    void reloadCards();
  }, [reloadCards]);

  const cardsByQuadrant = useMemo(() => {
    const out: Record<PriorityMatrixQuadrantKey, CardRow[]> = {
      do_first: [],
      schedule: [],
      delegate: [],
      eliminate: [],
    };
    for (const c of cards) {
      const q = selectedByCard[c.id];
      if (q) out[q].push(c);
    }
    return out;
  }, [cards, selectedByCard]);

  const inboxCards = useMemo(() => cards.filter((c) => !selectedByCard[c.id]), [cards, selectedByCard]);

  const matrixSelections = useMemo(
    () =>
      Object.entries(selectedByCard)
        .filter(([, quadrantKey]) => Boolean(quadrantKey))
        .map(([cardId, quadrantKey]) => ({ cardId, quadrantKey: quadrantKey as PriorityMatrixQuadrantKey })),
    [selectedByCard]
  );

  const createInboxTask = useCallback(async () => {
    const title = inboxTitle.trim();
    if (!selectedBoardId || !title) return;
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? `EIS-${crypto.randomUUID().slice(0, 8)}`
        : `EIS-${Date.now()}`;
    const maxOrder = cards.reduce((acc, c) => Math.max(acc, c.order), -1);
    await apiPut(
      `/api/boards/${encodeURIComponent(selectedBoardId)}`,
      {
        cards: [...cards, { id, title, bucket: cards[0]?.bucket ?? "Backlog", priority: "Média", progress: "Não iniciado", desc: "", order: maxOrder + 1, tags: [], blockedBy: [], dueDate: null }],
        lastUpdated: new Date().toISOString(),
      },
      getHeaders()
    ).catch(() => null);
    setInboxTitle("");
    await reloadCards();
  }, [cards, getHeaders, inboxTitle, reloadCards, selectedBoardId]);

  const deleteCard = useCallback(
    async (cardId: string) => {
      await apiDelete(`/api/boards/${encodeURIComponent(selectedBoardId)}/cards/${encodeURIComponent(cardId)}`, getHeaders()).catch(
        async () => {
          await apiPut(
            `/api/boards/${encodeURIComponent(selectedBoardId)}`,
            { cards: cards.filter((c) => c.id !== cardId), lastUpdated: new Date().toISOString() },
            getHeaders()
          );
        }
      );
      setSelectedByCard((prev) => {
        const next = { ...prev };
        delete next[cardId];
        return next;
      });
      await reloadCards();
    },
    [cards, getHeaders, reloadCards, selectedBoardId]
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={selectedBoardId}
          onChange={(e) => setSelectedBoardId(e.target.value)}
          className="px-3 py-2 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-sm"
        >
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <a className="btn-secondary" href={`/${locale}/board/${encodeURIComponent(selectedBoardId)}`}>
          Abrir board
        </a>
      </div>

      <div className="rounded-[var(--flux-rad-lg)] border border-[var(--flux-chrome-alpha-12)] p-3">
        <p className="text-xs text-[var(--flux-text-muted)] mb-2">Inbox → classifique na matriz.</p>
        <div className="flex gap-2">
          <input
            value={inboxTitle}
            onChange={(e) => setInboxTitle(e.target.value)}
            placeholder="Adicionar tarefa ao inbox"
            className="flex-1 px-3 py-2 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-sm"
          />
          <button type="button" className="btn-secondary" onClick={() => void createInboxTask()} disabled={!inboxTitle.trim()}>
            Criar
          </button>
        </div>
      </div>

      {loading ? <p className="text-xs text-[var(--flux-text-muted)]">Carregando…</p> : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {QUADRANTS.map((q) => (
          <section key={q.key} className="rounded-[var(--flux-rad-lg)] border border-[var(--flux-chrome-alpha-12)] p-3 bg-[var(--flux-surface-elevated)]/30">
            <h3 className="font-semibold text-sm mb-2">{q.label}</h3>
            <div className="space-y-2 min-h-[90px]">
              {cardsByQuadrant[q.key].map((c) => (
                <div key={c.id} className="rounded-md border border-[var(--flux-control-border)] px-2 py-1.5 text-xs flex items-center gap-2">
                  <span className="truncate flex-1">{c.title}</span>
                  <select
                    value={selectedByCard[c.id] ?? q.key}
                    onChange={(e) =>
                      setSelectedByCard((prev) => ({ ...prev, [c.id]: e.target.value as PriorityMatrixQuadrantKey }))
                    }
                    className="text-[11px] rounded px-1 py-0.5 bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)]"
                  >
                    {QUADRANTS.map((opt) => (
                      <option key={opt.key} value={opt.key}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="text-[10px] text-[var(--flux-danger)]" onClick={() => void deleteCard(c.id)}>
                    Excluir
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="rounded-[var(--flux-rad-lg)] border border-dashed border-[var(--flux-chrome-alpha-20)] p-3">
        <h3 className="font-semibold text-sm mb-2">Inbox</h3>
        <div className="space-y-2">
          {inboxCards.map((c) => (
            <div key={c.id} className="rounded-md border border-[var(--flux-control-border)] px-2 py-1.5 text-xs flex items-center gap-2">
              <span className="truncate flex-1">{c.title}</span>
              <select
                value={selectedByCard[c.id] ?? ""}
                onChange={(e) =>
                  setSelectedByCard((prev) => ({ ...prev, [c.id]: e.target.value as PriorityMatrixQuadrantKey }))
                }
                className="text-[11px] rounded px-1 py-0.5 bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)]"
              >
                <option value="">Mover para…</option>
                {QUADRANTS.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button type="button" className="text-[10px] text-[var(--flux-danger)]" onClick={() => void deleteCard(c.id)}>
                Excluir
              </button>
            </div>
          ))}
          {inboxCards.length === 0 ? <p className="text-[11px] text-[var(--flux-text-muted)]">Inbox vazio.</p> : null}
        </div>
      </section>

      {isAdmin ? (
        <div className="pt-2 border-t border-[var(--flux-chrome-alpha-08)]">
          <button type="button" className="btn-primary" disabled={!selectedBoardId} onClick={() => setPublishOpen(true)}>
            Publicar template Eisenhower
          </button>
        </div>
      ) : null}

      <BoardTemplateExportModal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        boardId={selectedBoardId}
        getHeaders={getHeaders}
        defaultTemplateKind="priority_matrix"
        eisenhowerPublishSelections={matrixSelections}
      />
    </div>
  );
}
