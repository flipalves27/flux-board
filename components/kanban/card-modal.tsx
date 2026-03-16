"use client";

import { useState, useEffect } from "react";
import type { CardData, BucketConfig, CardLink } from "@/app/board/[id]/page";

interface CardModalProps {
  card: CardData;
  mode: "new" | "edit";
  buckets: BucketConfig[];
  priorities: string[];
  progresses: string[];
  filterLabels: string[];
  onClose: () => void;
  onSave: (card: CardData) => void;
  onDelete?: (cardId: string) => void;
}

const inputBase =
  "w-full px-4 py-3 border border-[var(--g200)] rounded-xl text-sm transition-all duration-200 outline-none focus:border-[var(--teal)] focus:ring-2 focus:ring-[rgba(0,201,183,0.15)] hover:border-[var(--g300)]";

export function CardModal({
  card,
  mode,
  buckets,
  priorities,
  progresses,
  filterLabels,
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
  const [links, setLinks] = useState<CardLink[]>(card.links && card.links.length > 0 ? [...card.links] : []);

  useEffect(() => {
    setId(card.id);
    setTitle(card.title);
    setDesc(card.desc);
    setBucket(card.bucket);
    setPriority(card.priority);
    setProgress(card.progress);
    setDueDate(card.dueDate || "");
    setTags(new Set(card.tags || []));
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
      alert("Informe o título.");
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

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 card-modal-backdrop"
      onClick={onClose}
    >
      <div
        className="absolute inset-0 bg-[var(--navy)]/40 backdrop-blur-md"
        aria-hidden
      />
      <div
        className="relative bg-white rounded-2xl w-full max-w-[720px] max-h-[90vh] overflow-y-auto shadow-[0_24px_80px_rgba(10,31,63,0.2)] border border-[var(--g200)]/60 scrollbar-kanban card-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra de destaque superior */}
        <div
          className="h-1 rounded-t-2xl"
          style={{
            background: "linear-gradient(90deg, var(--teal), var(--teal-d))",
          }}
        />

        <div className="p-8">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="font-display font-extrabold text-xl text-[var(--g800)] flex items-center gap-3">
                {mode === "edit" ? "Editar Card" : "Novo Card"}
                {mode === "edit" && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-[var(--blue-bg)] text-[var(--blue)] border border-[var(--blue-b)]">
                    {card.id}
                  </span>
                )}
              </h2>
              <p className="text-sm text-[var(--g500)] mt-1">
                {mode === "edit"
                  ? "Atualize as informações do card"
                  : "Preencha os dados para criar um novo card"}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 rounded-xl border border-[var(--g200)] bg-[var(--g50)] text-[var(--g500)] flex items-center justify-center text-lg hover:bg-[var(--g200)] hover:text-[var(--g800)] transition-all duration-200 shrink-0"
            >
              ×
            </button>
          </div>

          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-[var(--g600)] mb-2 uppercase tracking-wider">
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
                <label className="block text-xs font-semibold text-[var(--g600)] mb-2 uppercase tracking-wider">
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
              <label className="block text-xs font-semibold text-[var(--g600)] mb-2 uppercase tracking-wider">
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
              <label className="block text-xs font-semibold text-[var(--g600)] mb-2 uppercase tracking-wider">
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
                <label className="block text-xs font-semibold text-[var(--g600)] mb-2 uppercase tracking-wider">
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
                <label className="block text-xs font-semibold text-[var(--g600)] mb-2 uppercase tracking-wider">
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
                <label className="block text-xs font-semibold text-[var(--g600)] mb-2 uppercase tracking-wider">
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
              <label className="block text-xs font-semibold text-[var(--g600)] mb-2 uppercase tracking-wider">
                Rótulos
              </label>
              <div className="flex flex-wrap gap-2">
                {filterLabels.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTag(t)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all duration-200 ${
                      tags.has(t)
                        ? "bg-[var(--teal)] text-[var(--navy)] border-[var(--teal)] shadow-sm"
                        : "bg-white text-[var(--g600)] border-[var(--g200)] hover:border-[var(--teal)] hover:text-[var(--teal-d)] hover:bg-[rgba(0,201,183,0.06)]"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Links — lista discreta e moderna */}
            <div className="rounded-xl border border-[var(--g100)] bg-[var(--g50)]/50 overflow-hidden transition-all duration-200">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--g100)]">
                <span className="text-xs font-semibold text-[var(--g500)] uppercase tracking-wider flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-[var(--teal)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  Links
                </span>
                <button
                  type="button"
                  onClick={() => setLinks((prev) => [...prev, { url: "", label: "" }])}
                  className="text-xs font-semibold text-[var(--teal)] hover:text-[var(--teal-d)] px-2 py-1 rounded-lg hover:bg-[rgba(0,201,183,0.08)] transition-colors"
                >
                  + Adicionar link
                </button>
              </div>
              <ul className="divide-y divide-[var(--g100)] max-h-[200px] overflow-y-auto scrollbar-kanban">
                {links.length === 0 ? (
                  <li className="px-4 py-4 text-center text-xs text-[var(--g400)]">
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
                        className="flex-1 min-w-0 px-3 py-2 text-sm border border-[var(--g200)] rounded-lg bg-white focus:border-[var(--teal)] focus:ring-1 focus:ring-[var(--teal)]/20 outline-none transition-all"
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
                        className="w-32 shrink-0 px-3 py-2 text-sm border border-[var(--g200)] rounded-lg bg-white focus:border-[var(--teal)] focus:ring-1 focus:ring-[var(--teal)]/20 outline-none transition-all"
                      />
                      {link.url.trim() ? (
                        <a
                          href={link.url.trim()}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--teal)] hover:bg-[rgba(0,201,183,0.1)] transition-colors shrink-0"
                          title="Visualizar link"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        </a>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setLinks((prev) => prev.filter((_, i) => i !== idx))}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--g400)] hover:bg-[var(--red-bg)] hover:text-[var(--red)] transition-colors opacity-70 group-hover:opacity-100"
                        title="Remover link"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>

          <div className="flex gap-3 justify-end mt-8 pt-6 border-t border-[var(--g200)] flex-wrap">
            {mode === "edit" && onDelete && (
              <button
                type="button"
                onClick={() => {
                  if (confirm("Excluir este card?")) {
                    onDelete(card.id);
                    onClose();
                  }
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
      </div>
    </div>
  );
}
