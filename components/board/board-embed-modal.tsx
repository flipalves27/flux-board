"use client";

import { useState } from "react";
import { apiPost, ApiError } from "@/lib/api-client";
import type { EmbedWidgetKind } from "@/lib/kv-embed";

type Props = {
  open: boolean;
  onClose: () => void;
  boardId: string;
  getHeaders: () => Record<string, string>;
};

const KINDS: { id: EmbedWidgetKind; label: string }[] = [
  { id: "badge", label: "Badge de status" },
  { id: "kanban", label: "Mini Kanban (somente leitura)" },
  { id: "heatmap", label: "Heatmap por coluna" },
  { id: "okr", label: "OKR / portfólio (resumo)" },
];

export function BoardEmbedModal({ open, onClose, boardId, getHeaders }: Props) {
  const [kind, setKind] = useState<EmbedWidgetKind>("badge");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iframeSnippet, setIframeSnippet] = useState<string | null>(null);

  if (!open) return null;

  async function create() {
    setError(null);
    setBusy(true);
    setIframeSnippet(null);
    try {
      const res = await apiPost<{ embed: { iframeSnippet: string; embedUrl: string } }>(
        `/api/boards/${encodeURIComponent(boardId)}/embed`,
        { kind },
        getHeaders()
      );
      setIframeSnippet(res?.embed?.iframeSnippet ?? `<iframe src="${res?.embed?.embedUrl}" />`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Erro ao criar widget.");
    } finally {
      setBusy(false);
    }
  }

  async function copySnippet() {
    if (!iframeSnippet) return;
    try {
      await navigator.clipboard.writeText(iframeSnippet);
    } catch {
      setError("Não foi possível copiar.");
    }
  }

  return (
    <div className="fixed inset-0 z-[var(--flux-z-modal-critical)] flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm" role="dialog" aria-modal>
      <div className="w-full max-w-lg rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-25)] bg-[var(--flux-surface-card)] shadow-[0_20px_50px_var(--flux-black-alpha-45)] p-6">
        <h2 className="text-lg font-semibold text-[var(--flux-text)] font-display">Widget para sites externos</h2>
        <p className="text-sm text-[var(--flux-text-muted)] mt-1 mb-4">
          Leitura em tempo quase real (atualização a cada 30s). Cole o iframe no site, Notion ou intranet.
        </p>

        {error && (
          <div className="mb-3 text-sm text-[var(--flux-danger)] border border-[var(--flux-danger-alpha-35)] rounded-[var(--flux-rad)] px-3 py-2">
            {error}
          </div>
        )}

        <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">Tipo</label>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as EmbedWidgetKind)}
          className="w-full mb-4 px-3 py-2 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-sm"
        >
          {KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>

        <div className="flex justify-end gap-2 mb-4">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Fechar
          </button>
          <button type="button" className="btn-primary" onClick={() => void create()} disabled={busy}>
            {busy ? "Gerando…" : "Gerar snippet"}
          </button>
        </div>

        {iframeSnippet && (
          <div className="space-y-2">
            <p className="text-xs text-[var(--flux-secondary)]">Cole este código no destino:</p>
            <pre className="text-[10px] font-mono p-3 rounded-[var(--flux-rad)] bg-[var(--flux-black-alpha-35)] overflow-x-auto whitespace-pre-wrap break-all border border-[var(--flux-chrome-alpha-08)]">
              {iframeSnippet}
            </pre>
            <button type="button" className="btn-secondary text-sm" onClick={() => void copySnippet()}>
              Copiar iframe
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
