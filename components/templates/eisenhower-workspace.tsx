"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { apiDelete, apiGet, apiPut } from "@/lib/api-client";
import { BoardTemplateExportModal } from "@/components/board/board-template-export-modal";
import type { PriorityMatrixQuadrantKey } from "@/lib/template-types";

type CardRow = { id: string; title: string; bucket: string; order: number };
type QuadrantDef = {
  key: PriorityMatrixQuadrantKey;
  label: string;
  subtitle: string;
  chipClass: string;
  panelClass: string;
  emptyCopy: string;
};

const QUADRANTS: QuadrantDef[] = [
  {
    key: "do_first",
    label: "Do First",
    subtitle: "Urgente + Importante",
    chipClass: "bg-[var(--flux-danger-alpha-15)] text-[var(--flux-danger)] border-[var(--flux-danger-alpha-35)]",
    panelClass: "border-[var(--flux-danger-alpha-25)] bg-[var(--flux-danger-alpha-08)]/50",
    emptyCopy: "Sem itens aqui. Priorize o que tem alto impacto e prazo curto.",
  },
  {
    key: "schedule",
    label: "Schedule",
    subtitle: "Importante, não urgente",
    chipClass:
      "bg-[var(--flux-secondary-alpha-15)] text-[var(--flux-secondary)] border-[var(--flux-secondary-alpha-35)]",
    panelClass: "border-[var(--flux-secondary-alpha-25)] bg-[var(--flux-secondary-alpha-08)]/50",
    emptyCopy: "Espaço ideal para planejamento. Adicione ações que evitam urgências futuras.",
  },
  {
    key: "delegate",
    label: "Delegate",
    subtitle: "Urgente, pouco impacto",
    chipClass:
      "bg-[var(--flux-warning-alpha-15)] text-[var(--flux-warning-foreground)] border-[var(--flux-warning-alpha-35)]",
    panelClass: "border-[var(--flux-warning-alpha-25)] bg-[var(--flux-warning-alpha-08)]/45",
    emptyCopy: "Itens operacionais entram aqui. Delegue com dono e prazo claros.",
  },
  {
    key: "eliminate",
    label: "Delete",
    subtitle: "Nem urgente nem importante",
    chipClass: "bg-[var(--flux-chrome-alpha-10)] text-[var(--flux-text-muted)] border-[var(--flux-chrome-alpha-20)]",
    panelClass: "border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-black-alpha-06)]",
    emptyCopy: "Ótimo. Mantenha este quadrante limpo para proteger o foco do time.",
  },
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
  const [movedCardIds, setMovedCardIds] = useState<Record<string, true>>({});

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

  const moveCardToQuadrant = useCallback((cardId: string, quadrantKey: PriorityMatrixQuadrantKey) => {
    setSelectedByCard((prev) => ({ ...prev, [cardId]: quadrantKey }));
    setMovedCardIds((prev) => ({ ...prev, [cardId]: true }));
    window.setTimeout(() => {
      setMovedCardIds((prev) => {
        const next = { ...prev };
        delete next[cardId];
        return next;
      });
    }, 520);
  }, []);

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
      <div className="rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-elevated)]/40 p-4 sm:p-5">
        <p className="text-sm text-[var(--flux-text)] font-medium">
          Classifique tarefas por impacto e urgência para decidir o que fazer agora, agendar, delegar ou eliminar.
        </p>
        <p className="text-xs text-[var(--flux-text-muted)] mt-1.5">
          Dica: comece pelo Inbox, depois mova cada item para um quadrante com base em prazo real e valor para o objetivo.
        </p>
      </div>

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
        {selectedBoardId ? (
          <span className="text-[11px] text-[var(--flux-text-muted)] px-2 py-1 rounded-md border border-[var(--flux-chrome-alpha-12)]">
            {cards.length} item(ns) carregado(s)
          </span>
        ) : null}
      </div>

      <div className="rounded-[var(--flux-rad-lg)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-primary-alpha-08)]/40 p-3">
        <p className="text-xs text-[var(--flux-text)] font-semibold mb-1">Inbox -> Matriz</p>
        <p className="text-[11px] text-[var(--flux-text-muted)] mb-2">
          Capture rapidamente e classifique em seguida para manter a priorização objetiva.
        </p>
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
          <section key={q.key} className={`rounded-[var(--flux-rad-lg)] border p-3 ${q.panelClass}`}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <h3 className="font-semibold text-sm text-[var(--flux-text)]">{q.label}</h3>
                <p className="text-[11px] text-[var(--flux-text-muted)] mt-0.5">{q.subtitle}</p>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${q.chipClass}`}>
                {cardsByQuadrant[q.key].length}
              </span>
            </div>
            <div className="space-y-2 min-h-[90px]">
              {cardsByQuadrant[q.key].length === 0 ? (
                <div className="rounded-md border border-dashed border-[var(--flux-chrome-alpha-20)] px-3 py-3 text-[11px] text-[var(--flux-text-muted)] bg-[var(--flux-surface-card)]/45">
                  {q.emptyCopy}
                </div>
              ) : (
                cardsByQuadrant[q.key].map((c) => (
                  <div
                    key={c.id}
                    className={`eis-motion rounded-md border bg-[var(--flux-surface-card)]/80 px-2 py-1.5 text-xs flex items-center gap-2 hover:border-[var(--flux-primary-alpha-30)] transition-all duration-300 ease-out ${
                      movedCardIds[c.id]
                        ? "border-[var(--flux-primary-alpha-45)] ring-1 ring-[var(--flux-primary-alpha-30)] shadow-[0_0_0_1px_var(--flux-primary-alpha-20)]"
                        : "border-[var(--flux-control-border)]"
                    }`}
                    style={{ animation: "eisCardEnter 220ms ease-out, eisCardLift 520ms ease-out" }}
                  >
                    <span className="truncate flex-1">{c.title}</span>
                    <select
                      value={selectedByCard[c.id] ?? q.key}
                      onChange={(e) => moveCardToQuadrant(c.id, e.target.value as PriorityMatrixQuadrantKey)}
                      className="text-[11px] rounded px-1 py-0.5 bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)]"
                      aria-label={`Mover ${c.title}`}
                    >
                      {QUADRANTS.map((opt) => (
                        <option key={opt.key} value={opt.key}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="text-[10px] text-[var(--flux-danger)]"
                      onClick={() => void deleteCard(c.id)}
                    >
                      Excluir
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        ))}
      </div>

      <section className="rounded-[var(--flux-rad-lg)] border border-dashed border-[var(--flux-primary-alpha-25)] bg-[var(--flux-primary-alpha-08)]/20 p-3">
        <h3 className="font-semibold text-sm mb-2">Inbox</h3>
        <p className="text-[11px] text-[var(--flux-text-muted)] mb-2">
          Itens ainda não classificados. Use “Mover para...” para enviar cada tarefa ao quadrante correto.
        </p>
        <div className="space-y-2">
          {inboxCards.map((c) => (
            <div
              key={c.id}
              className="eis-motion rounded-md border border-[var(--flux-control-border)] bg-[var(--flux-surface-card)]/80 px-2 py-1.5 text-xs flex items-center gap-2 transition-all duration-300 ease-out hover:border-[var(--flux-primary-alpha-30)]"
              style={{ animation: "eisCardEnter 220ms ease-out" }}
            >
              <span className="truncate flex-1">{c.title}</span>
              <select
                value={selectedByCard[c.id] ?? ""}
                onChange={(e) => moveCardToQuadrant(c.id, e.target.value as PriorityMatrixQuadrantKey)}
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
          {inboxCards.length === 0 ? (
            <div className="rounded-md border border-dashed border-[var(--flux-chrome-alpha-20)] px-3 py-3 text-[11px] text-[var(--flux-text-muted)] bg-[var(--flux-surface-card)]/50">
              Inbox vazio. Excelente: tudo foi classificado. Revise os quadrantes e publique seu template.
            </div>
          ) : null}
        </div>
      </section>

      {isAdmin ? (
        <div className="pt-2 border-t border-[var(--flux-chrome-alpha-08)] flex items-center justify-between gap-3">
          <p className="text-[11px] text-[var(--flux-text-muted)]">
            Checklist rápido: classifique os itens-chave e publique para reutilizar o modelo com o time.
          </p>
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
      <style jsx>{`
        @keyframes eisCardEnter {
          from {
            opacity: 0;
            transform: translateY(4px) scale(0.995);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes eisCardLift {
          0% {
            box-shadow: 0 0 0 0 rgba(76, 127, 255, 0);
          }
          35% {
            box-shadow: 0 0 0 4px rgba(76, 127, 255, 0.15);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(76, 127, 255, 0);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .eis-motion {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </div>
  );
}
