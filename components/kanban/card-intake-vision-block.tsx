"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, ApiError, getApiHeaders } from "@/lib/api-client";
import type { DescriptionBlocksState } from "@/components/kanban/description-blocks";

type Props = {
  boardId: string;
  getHeaders: () => Record<string, string>;
  mode: "new" | "edit";
  setTitle: (v: string) => void;
  setDescBlocks: (v: DescriptionBlocksState | ((prev: DescriptionBlocksState) => DescriptionBlocksState)) => void;
  onApplied?: () => void;
};

export function CardIntakeVisionBlock({
  boardId,
  getHeaders,
  mode,
  setTitle,
  setDescBlocks,
  onApplied,
}: Props) {
  const t = useTranslations("kanban.cardModal.intakeVision");
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [suggestedTitle, setSuggestedTitle] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (mode !== "new") return null;

  const onPick = () => inputRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setErr(null);
    setPreview(null);
    setSuggestedTitle(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const headers = { ...getHeaders(), ...getApiHeaders() };
      delete (headers as Record<string, string>)["Content-Type"];
      const res = await apiFetch(`/api/boards/${boardId}/intake-vision`, {
        method: "POST",
        body: form,
        headers,
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        extracted?: string;
        suggestedTitle?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new ApiError(data.error ?? "Erro", res.status);
      }
      if (data.extracted) setPreview(data.extracted);
      if (data.suggestedTitle) setSuggestedTitle(data.suggestedTitle);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (!preview) return;
    if (suggestedTitle) setTitle(suggestedTitle);
    setDescBlocks((prev) => ({
      ...prev,
      notes: prev.notes ? `${prev.notes}\n\n---\n${preview}` : preview,
    }));
    onApplied?.();
    setPreview(null);
    setSuggestedTitle(null);
  };

  return (
    <div className="mb-4 rounded-xl border border-[var(--flux-primary-alpha-22)] bg-[var(--flux-primary-alpha-06)] px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--flux-primary-light)]">{t("badge")}</p>
          <p className="text-[11px] text-[var(--flux-text-muted)]">{t("hint")}</p>
        </div>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => void onFile(e)} />
        <button type="button" className="btn-secondary px-3 py-1.5 text-[11px]" disabled={busy} onClick={onPick}>
          {busy ? t("busy") : t("pick")}
        </button>
      </div>
      {err ? <p className="mt-2 text-[11px] text-[var(--flux-danger-bright)]">{err}</p> : null}
      {preview ? (
        <div className="mt-3 space-y-2">
          <p className="text-[10px] font-semibold uppercase text-[var(--flux-text-muted)]">Preview</p>
          <pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-dark)] p-2 text-[11px] text-[var(--flux-text)]">
            {preview}
          </pre>
          <button type="button" className="btn-primary px-3 py-1.5 text-[11px]" onClick={apply}>
            {t("apply")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
