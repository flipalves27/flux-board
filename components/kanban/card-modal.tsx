"use client";

import { useState, useEffect, useRef } from "react";
import type { CardData, BucketConfig, CardLink } from "@/app/board/[id]/page";
import { CustomTooltip } from "@/components/ui/custom-tooltip";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/context/toast-context";

interface CardModalProps {
  card: CardData;
  mode: "new" | "edit";
  buckets: BucketConfig[];
  priorities: string[];
  progresses: string[];
  filterLabels: string[];
  onCreateLabel?: (label: string) => void;
  onDeleteLabel?: (label: string) => void;
  onClose: () => void;
  onSave: (card: CardData) => void;
  onDelete?: (cardId: string) => void;
}

const inputBase =
  "w-full px-4 py-3 border border-[rgba(255,255,255,0.12)] rounded-xl text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] transition-all duration-200 outline-none focus:border-[var(--flux-primary)] focus:ring-2 focus:ring-[rgba(108,92,231,0.25)] hover:border-[rgba(255,255,255,0.2)]";

export function CardModal({
  card,
  mode,
  buckets,
  priorities,
  progresses,
  filterLabels,
  onCreateLabel,
  onDeleteLabel,
  onClose,
  onSave,
  onDelete,
}: CardModalProps) {
  const [id, setId] = useState(card.id);
  const [title, setTitle] = useState(card.title);
  const [desc, setDesc] = useState(card.desc);
  const [bucket, setBucket] = useState(card.bucket);
  const [priority, setPriority] = useState(card.priority);
  const [progress, setProgress] = useState(card.progress);
  const [dueDate, setDueDate] = useState(card.dueDate || "");
  const [tags, setTags] = useState<Set<string>>(new Set(card.tags || []));
  const [newLabel, setNewLabel] = useState("");
  const [links, setLinks] = useState<CardLink[]>(card.links && card.links.length > 0 ? [...card.links] : []);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const { pushToast } = useToast();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  useModalA11y({
    // Evita conflitos de focus trap quando abrimos o ConfirmDialog.
    open: !confirmDeleteOpen,
    onClose,
    containerRef: dialogRef,
    initialFocusRef: closeBtnRef,
  });

  useEffect(() => {
    setId(card.id);
    setTitle(card.title);
    setDesc(card.desc);
    setBucket(card.bucket);
    setPriority(card.priority);
    setProgress(card.progress);
    setDueDate(card.dueDate || "");
    setTags(new Set(card.tags || []));
    setNewLabel("");
    setLinks(card.links && card.links.length > 0 ? [...card.links] : []);
  }, [card]);

  const toggleTag = (t: string) => {
    setTags((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const handleSave = () => {
    const t = title.trim();
    if (!t) {
      pushToast({ kind: "error", title: "Informe o título." });
      return;
    }
    const finalId = id.trim() || (mode === "new" ? `NEW-${Date.now()}` : card.id);
    onSave({
      ...card,
      id: finalId,
      title: t,
      desc: desc.trim() || "Sem descrição.",
      bucket,
      priority,
      progress,
      dueDate: dueDate || null,
      tags: [...tags],
      links: links.filter((l) => l.url.trim()),
      order: card.order ?? 0,
    });
  };

  const handleCreateLabel = () => {
    const normalized = newLabel.trim();
    if (!normalized) return;
    onCreateLabel?.(normalized);
    setTags((prev) => new Set([...prev, normalized]));
    setNewLabel("");
  };

  const handleDeleteLabel = (label: string) => {
    onDeleteLabel?.(label);
    setTags((prev) => {
      const next = new Set(prev);
      next.delete(label);
      return next;
    });
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 card-modal-backdrop"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-md"
        aria-hidden
      />
      <div
        className="relative bg-[var(--flux-surface-card)] rounded-2xl w-full max-w-[720px] max-h-[90vh] overflow-y-auto shadow-[0_24px_80px_rgba(0,0,0,0.5)] border border-[rgba(108,92,231,0.2)] scrollbar-kanban card-modal-content"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-modal-title"
        tabIndex={-1}
      >
        <div
          className="h-1 rounded-t-2xl"
          style={{
            background: "linear-gradient(90deg, var(--flux-primary), var(--flux-secondary))",
          }}
        />

        <div className="p-8">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h2
                id="card-modal-title"
                className="font-display font-bold text-xl text-[var(--flux-text)] flex items-center gap-3"
              >
                {mode === "edit" ? "Editar Card" : "Novo Card"}
                {mode === "edit" && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-[rgba(116,185,255,0.12)] text-[var(--flux-info)] border border-[rgba(116,185,255,0.35)]">
                    {card.id}
                  </span>
                )}
              </h2>
              <p className="text-sm text-[var(--flux-text-muted)] mt-1">
                {mode === "edit"
                  ? "Atualize as informações do card"
                  : "Preencha os dados para criar um novo card"}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              ref={closeBtnRef}
              className="w-10 h-10 rounded-xl border border-[rgba(255,255,255,0.12)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)] flex items-center justify-center text-lg hover:bg-[rgba(255,255,255,0.08)] hover:text-[var(--flux-text)] transition-all duration-200 shrink-0"
            >
              ×
            </button>
          </div>

          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-2 uppercase tracking-wider font-display">
                  ID
                </label>
                <input
                  type="text"
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  placeholder="Ex: DI-700"
                  className={inputBase}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-2 uppercase tracking-wider font-display">
                  Coluna
                </label>
                <select
                  value={bucket}
                  onChange={(e) => setBucket(e.target.value)}
                  className={inputBase}
                >
                  {buckets.map((b) => (
                    <option key={b.key} value={b.key}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-2 uppercase tracking-wider font-display">
                Título
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título executivo do card"
                className={`${inputBase} text-base font-medium`}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-2 uppercase tracking-wider font-display">
                Descrição
              </label>
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Descreva os detalhes do card..."
                rows={4}
                className={`${inputBase} resize-y min-h-[100px]`}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-2 uppercase tracking-wider font-display">
                  Prioridade
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className={inputBase}
                >
                  {priorities.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-2 uppercase tracking-wider font-display">
                  Progresso
                </label>
                <select
                  value={progress}
                  onChange={(e) => setProgress(e.target.value)}
                  className={inputBase}
                >
                  {progresses.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-2 uppercase tracking-wider font-display">
                  Data de Conclusão
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className={inputBase}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-2 uppercase tracking-wider font-display">
                Rótulos
              </label>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCreateLabel();
                    }
                  }}
                  placeholder="Novo rótulo"
                  className={`${inputBase} py-2.5`}
                />
                <button
                  type="button"
                  onClick={handleCreateLabel}
                  className="px-4 rounded-xl text-sm font-semibold border border-[var(--flux-primary)] bg-[rgba(108,92,231,0.15)] text-[var(--flux-primary-light)] hover:bg-[rgba(108,92,231,0.25)] hover:shadow-[0_0_0_3px_rgba(108,92,231,0.15)] transition-all duration-200 font-display whitespace-nowrap"
                >
                  + Criar
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {filterLabels.map((t) => (
                  <div key={t} className="group relative">
                    <button
                      type="button"
                      onClick={() => toggleTag(t)}
                      className={`pl-4 pr-8 py-2 rounded-xl text-sm font-semibold border transition-all duration-200 font-display ${
                        tags.has(t)
                          ? "bg-[var(--flux-primary)] text-white border-[var(--flux-primary)] shadow-sm"
                          : "bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)] border-[rgba(255,255,255,0.12)] hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)] hover:bg-[rgba(108,92,231,0.1)]"
                      }`}
                    >
                      {t}
                    </button>
                    <CustomTooltip content={`Excluir rótulo "${t}"`}>
                      <button
                        type="button"
                        onClick={() => handleDeleteLabel(t)}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-md flex items-center justify-center text-[var(--flux-text-muted)] hover:text-[var(--flux-danger)] hover:bg-[rgba(255,107,107,0.15)] transition-all duration-200 opacity-60 group-hover:opacity-100"
                        aria-label={`Excluir rótulo ${t}`}
                      >
                        ×
                      </button>
                    </CustomTooltip>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[var(--flux-surface-elevated)]/50 overflow-hidden transition-all duration-200">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-[rgba(255,255,255,0.06)]">
                <span className="text-xs font-semibold text-[var(--flux-text-muted)] uppercase tracking-wider flex items-center gap-2 font-display">
                  <svg className="w-3.5 h-3.5 text-[var(--flux-primary-light)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  Links
                </span>
                <button
                  type="button"
                  onClick={() => setLinks((prev) => [...prev, { url: "", label: "" }])}
                  className="text-xs font-semibold text-[var(--flux-primary-light)] hover:text-[var(--flux-primary)] px-2 py-1 rounded-lg hover:bg-[rgba(108,92,231,0.12)] transition-colors"
                >
                  + Adicionar link
                </button>
              </div>
              <ul className="divide-y divide-[rgba(255,255,255,0.06)] max-h-[200px] overflow-y-auto scrollbar-kanban">
                {links.length === 0 ? (
                  <li className="px-4 py-4 text-center text-xs text-[var(--flux-text-muted)]">
                    Nenhum link. Clique em &quot;Adicionar link&quot; para incluir.
                  </li>
                ) : (
                  links.map((link, idx) => (
                    <li key={idx} className="px-4 py-2.5 flex items-center gap-2 group">
                      <input
                        type="url"
                        value={link.url}
                        onChange={(e) =>
                          setLinks((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], url: e.target.value };
                            return next;
                          })
                        }
                        placeholder="https://..."
                        className="flex-1 min-w-0 px-3 py-2 text-sm border border-[rgba(255,255,255,0.12)] rounded-lg bg-[var(--flux-surface-card)] text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] focus:border-[var(--flux-primary)] focus:ring-1 focus:ring-[var(--flux-primary)]/20 outline-none transition-all"
                      />
                      <input
                        type="text"
                        value={link.label ?? ""}
                        onChange={(e) =>
                          setLinks((prev) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], label: e.target.value };
                            return next;
                          })
                        }
                        placeholder="Rótulo (opcional)"
                        className="w-32 shrink-0 px-3 py-2 text-sm border border-[rgba(255,255,255,0.12)] rounded-lg bg-[var(--flux-surface-card)] text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] focus:border-[var(--flux-primary)] focus:ring-1 focus:ring-[var(--flux-primary)]/20 outline-none transition-all"
                      />
                      {link.url.trim() ? (
                        <CustomTooltip content="Visualizar link">
                          <a
                            href={link.url.trim()}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--flux-primary-light)] hover:bg-[rgba(108,92,231,0.15)] transition-colors shrink-0"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          </a>
                        </CustomTooltip>
                      ) : null}
                      <CustomTooltip content="Remover link">
                        <button
                          type="button"
                          onClick={() => setLinks((prev) => prev.filter((_, i) => i !== idx))}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--flux-text-muted)] hover:bg-[rgba(255,107,107,0.15)] hover:text-[var(--flux-danger)] transition-colors opacity-70 group-hover:opacity-100"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </CustomTooltip>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>

          <div className="flex gap-3 justify-end mt-8 pt-6 border-t border-[rgba(255,255,255,0.08)] flex-wrap">
            {mode === "edit" && onDelete && (
              <button
                type="button"
                onClick={() => {
                  setConfirmDeleteOpen(true);
                }}
                className="mr-auto btn-danger"
              >
                Excluir
              </button>
            )}
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancelar
            </button>
            <button type="button" onClick={handleSave} className="btn-primary">
              Salvar
            </button>
          </div>
        </div>
        <ConfirmDialog
          open={confirmDeleteOpen}
          title="Excluir este card?"
          description="Esta ação não pode ser desfeita."
          intent="danger"
          confirmText="Excluir"
          cancelText="Cancelar"
          onCancel={() => setConfirmDeleteOpen(false)}
          onConfirm={() => {
            onDelete?.(card.id);
            setConfirmDeleteOpen(false);
            onClose();
          }}
        />
      </div>
    </div>
  );
}
