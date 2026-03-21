"use client";

import { useEffect, useState } from "react";
import type { DocData } from "@/lib/docs-types";

type SaveStatus = "idle" | "saving" | "saved" | "error";

type Props = {
  doc: DocData | null;
  getHeaders: () => Record<string, string>;
  onSaved: (doc: DocData) => void;
  onDelete: (docId: string) => void;
};

export function DocsEditor({ doc, getHeaders, onSaved, onDelete }: Props) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  useEffect(() => {
    setTitle(doc?.title || "");
    setContent(doc?.contentMd || "");
    setSaveStatus("idle");
  }, [doc?.id]);

  useEffect(() => {
    if (!doc) return;
    const timer = window.setTimeout(async () => {
      try {
        setSaveStatus("saving");
        const res = await fetch(`/api/docs/${encodeURIComponent(doc.id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...getHeaders() },
          body: JSON.stringify({ title, contentMd: content }),
        });
        const data = (await res.json().catch(() => ({}))) as { doc?: DocData };
        if (!res.ok || !data.doc) throw new Error("save failed");
        onSaved(data.doc);
        setSaveStatus("saved");
      } catch {
        setSaveStatus("error");
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [title, content, doc?.id, getHeaders, onSaved]);

  if (!doc) {
    return <div className="flex-1 p-6 text-sm text-[var(--flux-text-muted)]">Selecione um documento ou crie um novo.</div>;
  }

  return (
    <div className="flex-1 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs text-[var(--flux-text-muted)]">
          {saveStatus === "saving" ? "Salvando..." : saveStatus === "saved" ? "Salvo" : saveStatus === "error" ? "Erro ao salvar" : ""}
        </div>
        <button className="btn-danger px-2 py-1 text-xs" onClick={() => onDelete(doc.id)}>
          Excluir
        </button>
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="mb-3 w-full rounded border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-base font-semibold text-[var(--flux-text)]"
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="h-[70vh] w-full resize-none rounded border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] p-3 font-mono text-sm text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
        placeholder="# Título"
      />
    </div>
  );
}
