"use client";

import { useCallback, useEffect, useState } from "react";
import { useCeremonyStore } from "@/stores/ceremony-store";
import { apiFetch, getApiHeaders } from "@/lib/api-client";
import type { RetroItem, RetroOutput } from "@/lib/ceremony-retrospective";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import { useRef } from "react";

type CeremonyRetroModalProps = {
  boardId: string;
  sprintId: string | null;
  getHeaders: () => Record<string, string>;
};

const CATEGORY_CONFIG = {
  went_well: {
    label: "O que funcionou bem 💚",
    color: "var(--flux-success)",
    bg: "var(--flux-success-alpha-08)",
    border: "var(--flux-success-alpha-22)",
  },
  improve: {
    label: "O que pode melhorar 🔶",
    color: "var(--flux-warning)",
    bg: "var(--flux-warning-alpha-08)",
    border: "var(--flux-warning-alpha-22)",
  },
  action: {
    label: "Ações concretas ✅",
    color: "var(--flux-primary)",
    bg: "var(--flux-primary-alpha-08)",
    border: "var(--flux-primary-alpha-22)",
  },
} as const;

function RetroItemCard({
  item,
  onVote,
  onDelete,
}: {
  item: RetroItem;
  onVote: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const cfg = CATEGORY_CONFIG[item.category];
  return (
    <div
      className="group flex items-start gap-2 rounded-lg border p-3 transition-all"
      style={{ borderColor: cfg.border, background: cfg.bg }}
    >
      <p className="flex-1 min-w-0 text-sm text-[var(--flux-text)] leading-relaxed">{item.text}</p>
      <div className="shrink-0 flex items-center gap-1.5 ml-2">
        {item.aiGenerated && (
          <span className="text-[10px] rounded-full px-1.5 py-0.5 bg-[var(--flux-primary-alpha-10)] text-[var(--flux-primary-light)] border border-[var(--flux-primary-alpha-22)]">IA</span>
        )}
        <button
          type="button"
          onClick={() => onVote(item.id)}
          className="flex items-center gap-0.5 rounded-full border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-2 py-0.5 text-xs text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-primary-light)] transition-all"
          style={item.votes > 0 ? { borderColor: cfg.border, color: cfg.color } : {}}
          aria-label={`Votar: ${item.votes} votos`}
        >
          👍 {item.votes}
        </button>
        <button
          type="button"
          onClick={() => onDelete(item.id)}
          className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-[var(--flux-danger)] hover:bg-[var(--flux-danger-alpha-15)] transition-all"
          aria-label="Remover item"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3" aria-hidden>
            <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function CeremonyRetroModal({ boardId, sprintId, getHeaders }: CeremonyRetroModalProps) {
  const { retroModalOpen, closeRetro } = useCeremonyStore();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const [loading, setLoading] = useState(false);
  const [retro, setRetro] = useState<RetroOutput | null>(null);
  const [error, setError] = useState<string | null>(null);

  useModalA11y({ open: retroModalOpen, onClose: closeRetro, containerRef: dialogRef, initialFocusRef: closeBtnRef });

  const loadRetro = useCallback(async () => {
    if (!sprintId || !retroModalOpen) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}/sprints/${encodeURIComponent(sprintId)}/retrospective`, {
        method: "POST",
        headers: getApiHeaders(getHeaders()),
      });
      if (res.ok) {
        const data = await res.json() as { retro: RetroOutput };
        setRetro(data.retro);
      } else {
        const data = await res.json() as { error?: string };
        setError(data.error ?? "Erro ao gerar retrospectiva.");
      }
    } catch (e) {
      setError("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  }, [boardId, sprintId, retroModalOpen, getHeaders]);

  useEffect(() => {
    if (retroModalOpen && !retro) void loadRetro();
  }, [retroModalOpen, retro, loadRetro]);

  useEffect(() => {
    if (!retroModalOpen) setRetro(null);
  }, [retroModalOpen]);

  const handleVote = useCallback((id: string) => {
    setRetro((prev) => {
      if (!prev) return prev;
      const update = (arr: RetroItem[]) => arr.map((i) => i.id === id ? { ...i, votes: i.votes + 1 } : i);
      return { ...prev, wentWell: update(prev.wentWell), improve: update(prev.improve), actions: update(prev.actions) };
    });
  }, []);

  const handleDelete = useCallback((id: string) => {
    setRetro((prev) => {
      if (!prev) return prev;
      const filter = (arr: RetroItem[]) => arr.filter((i) => i.id !== id);
      return { ...prev, wentWell: filter(prev.wentWell), improve: filter(prev.improve), actions: filter(prev.actions) };
    });
  }, []);

  const handleAddItem = useCallback((category: RetroItem["category"], text: string) => {
    const newItem: RetroItem = {
      id: Math.random().toString(36).slice(2, 10),
      category,
      text: text.trim().slice(0, 500),
      votes: 0,
      aiGenerated: false,
    };
    setRetro((prev) => {
      if (!prev) return prev;
      const key = category === "went_well" ? "wentWell" : category === "improve" ? "improve" : "actions";
      return { ...prev, [key]: [...prev[key], newItem] };
    });
  }, []);

  if (!retroModalOpen) return null;

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-xl" aria-hidden onClick={closeRetro} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="retro-modal-title"
        tabIndex={-1}
        className="relative z-10 flex flex-col w-full max-w-4xl max-h-[90vh] rounded-3xl border border-[var(--flux-primary-alpha-22)] bg-[var(--flux-surface-card)] shadow-[var(--flux-shadow-modal-depth)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-[var(--flux-chrome-alpha-06)] px-8 py-5 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">🔁</span>
              <h2 id="retro-modal-title" className="font-display font-bold text-xl text-[var(--flux-text)]">Retrospectiva IA</h2>
            </div>
            {retro && <p className="text-sm text-[var(--flux-text-muted)]">{retro.sprintName} — {retro.summary}</p>}
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={closeRetro}
            className="h-10 w-10 shrink-0 rounded-full border border-[var(--flux-chrome-alpha-10)] text-[var(--flux-text-muted)] flex items-center justify-center hover:bg-[var(--flux-chrome-alpha-06)] transition-all hover:rotate-90"
            aria-label="Fechar"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4" aria-hidden>
              <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-kanban px-8 py-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-12 h-12 rounded-full border-2 border-[var(--flux-primary)] border-t-transparent animate-spin" />
              <p className="text-sm text-[var(--flux-text-muted)]">Analisando sprint com IA…</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <p className="text-sm text-[var(--flux-danger)]">{error}</p>
              <button type="button" onClick={() => void loadRetro()} className="btn-secondary text-sm">Tentar novamente</button>
            </div>
          ) : retro ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {(["went_well", "improve", "action"] as const).map((cat) => {
                const cfg = CATEGORY_CONFIG[cat];
                const items = cat === "went_well" ? retro.wentWell : cat === "improve" ? retro.improve : retro.actions;
                const sortedItems = [...items].sort((a, b) => b.votes - a.votes);
                const [addText, setAddText] = useState("");
                const [adding, setAdding] = useState(false);

                return (
                  <div key={cat} className="space-y-3">
                    <h3 className="font-display font-semibold text-sm" style={{ color: cfg.color }}>{cfg.label}</h3>
                    <div className="space-y-2">
                      {sortedItems.map((item) => (
                        <RetroItemCard key={item.id} item={item} onVote={handleVote} onDelete={handleDelete} />
                      ))}
                    </div>
                    {adding ? (
                      <div className="flex flex-col gap-1.5">
                        <textarea
                          value={addText}
                          onChange={(e) => setAddText(e.target.value)}
                          placeholder="Descreva o item…"
                          className="w-full rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-transparent px-3 py-2 text-sm text-[var(--flux-text)] placeholder:text-[var(--flux-text-muted)] outline-none focus:border-[var(--flux-primary)] resize-none"
                          rows={2}
                          maxLength={500}
                          autoFocus
                        />
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => { if (addText.trim()) { handleAddItem(cat, addText); setAddText(""); setAdding(false); } }}
                            className="flex-1 rounded-md py-1 text-xs font-semibold text-white transition-colors"
                            style={{ background: cfg.color }}
                          >
                            Adicionar
                          </button>
                          <button type="button" onClick={() => { setAdding(false); setAddText(""); }} className="flex-1 rounded-md border border-[var(--flux-chrome-alpha-12)] py-1 text-xs text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-04)]">Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAdding(true)}
                        className="w-full rounded-lg border border-dashed border-[var(--flux-chrome-alpha-10)] py-2 text-xs text-[var(--flux-text-muted)] hover:border-current transition-all"
                        style={{ ["--hover-color" as string]: cfg.color }}
                      >
                        + Adicionar item
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-[var(--flux-chrome-alpha-06)] px-8 py-4 flex items-center justify-between gap-3">
          <button type="button" onClick={() => void loadRetro()} disabled={loading} className="btn-secondary text-sm disabled:opacity-50">
            🔄 Regenerar com IA
          </button>
          <button type="button" onClick={closeRetro} className="btn-primary text-sm">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
