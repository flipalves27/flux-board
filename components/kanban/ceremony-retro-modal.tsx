"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCeremonyStore } from "@/stores/ceremony-store";
import { apiFetch, getApiHeaders } from "@/lib/api-client";
import type { RetroFormat, RetroItem, RetroOutput } from "@/lib/ceremony-retrospective";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import { useTranslations } from "next-intl";

type CeremonyRetroModalProps = {
  getHeaders: () => Record<string, string>;
};

const CATEGORY_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; border: string }
> = {
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
  Start: {
    label: "Start ▶",
    color: "var(--flux-primary)",
    bg: "var(--flux-primary-alpha-08)",
    border: "var(--flux-primary-alpha-22)",
  },
  Stop: {
    label: "Stop ⏹",
    color: "var(--flux-danger)",
    bg: "var(--flux-danger-alpha-08)",
    border: "var(--flux-danger-alpha-22)",
  },
  Continue: {
    label: "Continue ⏭",
    color: "var(--flux-success)",
    bg: "var(--flux-success-alpha-08)",
    border: "var(--flux-success-alpha-22)",
  },
  Liked: {
    label: "Liked 💚",
    color: "var(--flux-success)",
    bg: "var(--flux-success-alpha-08)",
    border: "var(--flux-success-alpha-22)",
  },
  Learned: {
    label: "Learned 📘",
    color: "var(--flux-primary)",
    bg: "var(--flux-primary-alpha-08)",
    border: "var(--flux-primary-alpha-22)",
  },
  Lacked: {
    label: "Lacked ⚠️",
    color: "var(--flux-warning)",
    bg: "var(--flux-warning-alpha-08)",
    border: "var(--flux-warning-alpha-22)",
  },
  "Longed For": {
    label: "Longed For ✨",
    color: "var(--flux-secondary)",
    bg: "var(--flux-secondary-alpha-08)",
    border: "var(--flux-secondary-alpha-22)",
  },
};

function cfgFor(cat: string) {
  return (
    CATEGORY_CONFIG[cat] ?? {
      label: cat,
      color: "var(--flux-text-muted)",
      bg: "var(--flux-chrome-alpha-06)",
      border: "var(--flux-chrome-alpha-12)",
    }
  );
}

function RetroItemCard({
  item,
  onVote,
  onDelete,
}: {
  item: RetroItem;
  onVote: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const cfg = cfgFor(item.category);
  return (
    <div
      className="group flex items-start gap-2 rounded-lg border p-3 transition-all"
      style={{ borderColor: cfg.border, background: cfg.bg }}
    >
      <p className="flex-1 min-w-0 text-sm text-[var(--flux-text)] leading-relaxed">{item.text}</p>
      <div className="shrink-0 flex items-center gap-1.5 ml-2">
        {item.aiGenerated ? (
          <span className="text-[10px] rounded-full px-1.5 py-0.5 bg-[var(--flux-primary-alpha-10)] text-[var(--flux-primary-light)] border border-[var(--flux-primary-alpha-22)]">
            🤖 Fluxy
          </span>
        ) : null}
        {item.priority ? (
          <span className="text-[9px] uppercase tracking-wide text-[var(--flux-text-muted)]">{item.priority}</span>
        ) : null}
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

function RetroColumn({
  cat,
  label,
  items,
  onVote,
  onDelete,
  onAdd,
}: {
  cat: string;
  label: string;
  items: RetroItem[];
  onVote: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: (category: string, text: string) => void;
}) {
  const cfg = cfgFor(cat);
  const sortedItems = [...items].sort((a, b) => b.votes - a.votes);
  const [addText, setAddText] = useState("");
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-3">
      <h3 className="font-display font-semibold text-sm" style={{ color: cfg.color }}>
        {label}
      </h3>
      <div className="space-y-2">
        {sortedItems.map((item) => (
          <RetroItemCard key={item.id} item={item} onVote={onVote} onDelete={onDelete} />
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
              onClick={() => {
                if (addText.trim()) {
                  onAdd(cat, addText);
                  setAddText("");
                  setAdding(false);
                }
              }}
              className="flex-1 rounded-md py-1 text-xs font-semibold text-white transition-colors"
              style={{ background: cfg.color }}
            >
              Adicionar
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setAddText("");
              }}
              className="flex-1 rounded-md border border-[var(--flux-chrome-alpha-12)] py-1 text-xs text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-04)]"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full rounded-lg border border-dashed border-[var(--flux-chrome-alpha-10)] py-2 text-xs text-[var(--flux-text-muted)] hover:border-current transition-all"
        >
          + Adicionar item
        </button>
      )}
    </div>
  );
}

export default function CeremonyRetroModal({ getHeaders }: CeremonyRetroModalProps) {
  const t = useTranslations("kanban.ceremony.retroModal");
  const retroModalOpen = useCeremonyStore((s) => s.retroModalOpen);
  const retroBoardId = useCeremonyStore((s) => s.retroBoardId);
  const retroSprintId = useCeremonyStore((s) => s.retroSprintId);
  const closeRetro = useCeremonyStore((s) => s.closeRetro);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const [loading, setLoading] = useState(false);
  const [retro, setRetro] = useState<RetroOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<RetroFormat>("classic");
  const [status, setStatus] = useState<"draft" | "finalized">("draft");

  const getHeadersRef = useRef(getHeaders);
  getHeadersRef.current = getHeaders;

  useModalA11y({ open: retroModalOpen, onClose: closeRetro, containerRef: dialogRef, initialFocusRef: closeBtnRef });

  const loadRetro = useCallback(async () => {
    if (!retroSprintId || !retroBoardId || !retroModalOpen) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/api/boards/${encodeURIComponent(retroBoardId)}/sprints/${encodeURIComponent(retroSprintId)}/retrospective`,
        {
          method: "POST",
          headers: { ...getApiHeaders(getHeadersRef.current()), "Content-Type": "application/json" },
          body: JSON.stringify({ format }),
        }
      );
      if (res.ok) {
        const data = (await res.json()) as { retro: RetroOutput };
        setRetro(data.retro);
        setStatus("draft");
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Erro ao gerar retrospectiva.");
      }
    } catch {
      setError("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  }, [retroBoardId, retroSprintId, retroModalOpen, format]);

  useEffect(() => {
    if (retroModalOpen && !retro) void loadRetro();
  }, [retroModalOpen, retro, loadRetro]);

  useEffect(() => {
    if (!retroModalOpen) {
      setRetro(null);
      setFormat("classic");
      setStatus("draft");
    }
  }, [retroModalOpen]);

  const handleVote = useCallback((id: string) => {
    setRetro((prev) => {
      if (!prev) return prev;
      const bump = (arr: RetroItem[]) => arr.map((i) => (i.id === id ? { ...i, votes: i.votes + 1 } : i));
      if (prev.flexMode) {
        return { ...prev, flexMode: { ...prev.flexMode, items: bump(prev.flexMode.items) } };
      }
      return {
        ...prev,
        wentWell: bump(prev.wentWell),
        improve: bump(prev.improve),
        actions: bump(prev.actions),
      };
    });
  }, []);

  const handleDelete = useCallback((id: string) => {
    setRetro((prev) => {
      if (!prev) return prev;
      const del = (arr: RetroItem[]) => arr.filter((i) => i.id !== id);
      if (prev.flexMode) {
        return { ...prev, flexMode: { ...prev.flexMode, items: del(prev.flexMode.items) } };
      }
      return { ...prev, wentWell: del(prev.wentWell), improve: del(prev.improve), actions: del(prev.actions) };
    });
  }, []);

  const handleAddItem = useCallback((category: string, text: string) => {
    const newItem: RetroItem = {
      id: Math.random().toString(36).slice(2, 10),
      category,
      text: text.trim().slice(0, 500),
      votes: 0,
      aiGenerated: false,
    };
    setRetro((prev) => {
      if (!prev) return prev;
      if (prev.flexMode) {
        return { ...prev, flexMode: { ...prev.flexMode, items: [...prev.flexMode.items, newItem] } };
      }
      const key = category === "went_well" ? "wentWell" : category === "improve" ? "improve" : "actions";
      return { ...prev, [key]: [...(prev[key as keyof RetroOutput] as RetroItem[]), newItem] };
    });
  }, []);

  if (!retroModalOpen) return null;

  const flexCategories = retro?.flexMode
    ? retro.flexMode.format === "start-stop-continue"
      ? (["Start", "Stop", "Continue"] as const)
      : (["Liked", "Learned", "Lacked", "Longed For"] as const)
    : [];

  return (
    <div className="fixed inset-0 z-[var(--flux-z-modal-feature)] flex items-center justify-center p-4">
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
        <div className="shrink-0 border-b border-[var(--flux-chrome-alpha-06)] px-8 py-5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">🔁</span>
              <h2 id="retro-modal-title" className="font-display font-bold text-xl text-[var(--flux-text)]">
                {t("title")}
              </h2>
            </div>
            {retro ? <p className="text-sm text-[var(--flux-text-muted)]">{retro.sprintName} — {retro.summary}</p> : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-[var(--flux-text-muted)]">{t("format")}</span>
              <select
                className="rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-mid)] px-2 py-1 text-xs text-[var(--flux-text)]"
                value={format}
                disabled={loading}
                onChange={(e) => {
                  setFormat(e.target.value as RetroFormat);
                  setRetro(null);
                }}
              >
                <option value="classic">Went well / Improve / Actions</option>
                <option value="start-stop-continue">Start / Stop / Continue</option>
                <option value="4ls">4Ls</option>
              </select>
              <span className="text-[11px] rounded-full border border-[var(--flux-chrome-alpha-12)] px-2 py-0.5 text-[var(--flux-text-muted)]">
                {status === "draft" ? t("statusDraft") : t("statusFinal")}
              </span>
            </div>
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

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-kanban px-8 py-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-12 h-12 rounded-full border-2 border-[var(--flux-primary)] border-t-transparent animate-spin" />
              <p className="text-sm text-[var(--flux-text-muted)]">{t("loading")}</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <p className="text-sm text-[var(--flux-danger)]">{error}</p>
              <button type="button" onClick={() => void loadRetro()} className="btn-secondary text-sm">
                Tentar novamente
              </button>
            </div>
          ) : retro?.flexMode ? (
            <div
              className={`grid gap-6 ${retro.flexMode.format === "start-stop-continue" ? "md:grid-cols-3" : "md:grid-cols-2 lg:grid-cols-4"}`}
            >
              {flexCategories.map((cat) => (
                <RetroColumn
                  key={cat}
                  cat={cat}
                  label={cfgFor(cat).label}
                  items={retro.flexMode!.items.filter((i) => i.category === cat)}
                  onVote={handleVote}
                  onDelete={handleDelete}
                  onAdd={handleAddItem}
                />
              ))}
            </div>
          ) : retro ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <RetroColumn
                cat="went_well"
                label={cfgFor("went_well").label}
                items={retro.wentWell}
                onVote={handleVote}
                onDelete={handleDelete}
                onAdd={handleAddItem}
              />
              <RetroColumn
                cat="improve"
                label={cfgFor("improve").label}
                items={retro.improve}
                onVote={handleVote}
                onDelete={handleDelete}
                onAdd={handleAddItem}
              />
              <RetroColumn
                cat="action"
                label={cfgFor("action").label}
                items={retro.actions}
                onVote={handleVote}
                onDelete={handleDelete}
                onAdd={handleAddItem}
              />
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-[var(--flux-chrome-alpha-06)] px-8 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void loadRetro()} disabled={loading} className="btn-secondary text-sm disabled:opacity-50">
              🔄 {t("regenerate")}
            </button>
            <button
              type="button"
              className="btn-secondary text-sm"
              onClick={() => setStatus((s) => (s === "draft" ? "finalized" : "draft"))}
            >
              {status === "draft" ? t("markFinal") : t("markDraft")}
            </button>
          </div>
          <button type="button" onClick={closeRetro} className="btn-primary text-sm">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
