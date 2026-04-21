"use client";

import { useState } from "react";
import { FluxSurface } from "@/components/ui/flux-surface";

type Tab = "text" | "voice" | "photo" | "file";

type Props = {
  boardId: string;
  getHeaders: () => Record<string, string>;
  onClose: () => void;
};

/**
 * Card Intake unificado (Onda 4) — UI base; persistência via `/api/boards/[id]/intake` + modal existente.
 */
export function CardCreatorV2({ boardId, getHeaders, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("text");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function runIntake() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/boards/${encodeURIComponent(boardId)}/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getHeaders() },
        body: JSON.stringify({ text }),
      });
      const body = (await r.json()) as { error?: string; draft?: { title: string; description: string } };
      if (!r.ok) throw new Error(body.error || "Falha");
      setMsg(`Rascunho: ${body.draft?.title ?? ""}`.trim());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[var(--flux-z-command-backdrop)] flex items-center justify-center bg-[color-mix(in_srgb,var(--flux-surface-dark)_50%,transparent)] p-4">
      <FluxSurface tier={3} className="relative w-full max-w-lg p-5">
        <button type="button" className="absolute right-3 top-3 text-xs text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]" onClick={onClose}>
          Fechar
        </button>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-secondary-light)]">Novo card</p>
        <div className="mt-3 flex gap-1 border-b border-[var(--flux-border-muted)] pb-2">
          {(
            [
              { id: "text" as const, label: "Texto" },
              { id: "voice" as const, label: "Voz" },
              { id: "photo" as const, label: "Foto" },
              { id: "file" as const, label: "Arquivo" },
            ] as const
          ).map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setTab(x.id)}
              className={`rounded-md px-2 py-1 text-xs font-medium ${
                tab === x.id ? "bg-[var(--flux-primary-alpha-15)] text-[var(--flux-primary-light)]" : "text-[var(--flux-text-muted)]"
              }`}
            >
              {x.label}
            </button>
          ))}
        </div>
        {tab === "text" ? (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            className="mt-3 w-full rounded-[var(--flux-rad)] border border-[var(--flux-border-muted)] bg-[var(--flux-surface-card)] p-2 text-sm text-[var(--flux-text)]"
            placeholder="Cole notas, e-mail ou bullet points…"
          />
        ) : (
          <p className="mt-4 text-xs text-[var(--flux-text-muted)]">Modo em evolução — use Texto por enquanto.</p>
        )}
        {msg ? <p className="mt-2 text-xs text-[var(--flux-text-muted)]">{msg}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn-primary px-3 py-1.5 text-xs disabled:opacity-50" disabled={busy || tab !== "text"} onClick={() => void runIntake()}>
            {busy ? "…" : "Pré-visualizar intake"}
          </button>
        </div>
      </FluxSurface>
    </div>
  );
}
