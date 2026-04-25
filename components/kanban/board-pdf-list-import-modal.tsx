"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch, getApiHeaders } from "@/lib/api-client";
import { useBoardStore, callBoardPersist } from "@/stores/board-store";
import { useToast } from "@/context/toast-context";
import type { z } from "zod";
import { SpecPlanApplyCardSchema } from "@/lib/spec-plan-schemas";
import type { BoardData, BucketConfig } from "@/app/board/[id]/page";

const LIST_IMPORT_ENRICH_MAX = 12;
const ENRICH_DELAY_MS = 350;

type ApplyCard = z.infer<typeof SpecPlanApplyCardSchema>;
type Row = ApplyCard & { _key: string; include: boolean };

function newRow(c: ApplyCard, idx: number): Row {
  return { ...c, _key: `r-${idx}-${String(c.title).slice(0, 12)}`, include: true };
}

type Props = {
  open: boolean;
  onClose: () => void;
  boardId: string;
  getHeaders: () => Record<string, string>;
  onBoardReload: () => Promise<void>;
  bucketOrder: BucketConfig[];
  boardLabels: string[];
  /** Lowercase direction values as stored on cards, e.g. "manter" */
  directionStorageValues: string[];
};

export function BoardPdfListImportModal({
  open,
  onClose,
  boardId,
  getHeaders,
  onBoardReload,
  bucketOrder,
  boardLabels,
  directionStorageValues,
}: Props) {
  const t = useTranslations("kanban.boardListImport");
  const { pushToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [extractMeta, setExtractMeta] = useState<{
    kind: string;
    fileName: string;
    pageCount?: number;
    warnings: string[];
  } | null>(null);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [phase, setPhase] = useState<"idle" | "parsing" | "ready" | "applying" | "enriching">("idle");
  const [error, setError] = useState<string | null>(null);
  const [enrichAfter, setEnrichAfter] = useState(true);
  const [enrichProgress, setEnrichProgress] = useState<{ current: number; total: number } | null>(null);
  const [enrichNote, setEnrichNote] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setPasted("");
      setRows([]);
      setExtractMeta(null);
      setParseWarnings([]);
      setPhase("idle");
      setError(null);
      setEnrichAfter(true);
      setEnrichProgress(null);
      setEnrichNote(null);
    }
  }, [open]);

  const bucketKeys = useMemo(() => bucketOrder.map((b) => b.key).filter(Boolean), [bucketOrder]);
  const bucketOptions = useMemo(() => {
    if (bucketKeys.length > 0) return bucketKeys;
    return ["Backlog"];
  }, [bucketKeys]);
  const labelPalette = useMemo(() => {
    const s = new Set<string>();
    for (const x of boardLabels) {
      if (x?.trim()) s.add(x.trim());
    }
    const db = useBoardStore.getState().db;
    if (db?.config?.labels) {
      for (const x of db.config.labels) s.add(x);
    }
    return [...s].slice(0, 120);
  }, [boardLabels, open]);

  const runParse = useCallback(async () => {
    if (!file && !pasted.trim()) {
      setError(t("errors.noInput"));
      return;
    }
    setError(null);
    setPhase("parsing");
    const form = new FormData();
    if (pasted.trim()) form.set("pastedText", pasted);
    if (file) form.set("file", file, file.name);
    const headers: Record<string, string> = { ...getHeaders() };
    delete headers["Content-Type"];
    try {
      const res = await fetch(`/api/boards/${encodeURIComponent(boardId)}/list-import/parse`, {
        method: "POST",
        credentials: "same-origin",
        headers,
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        code?: string;
        cards?: ApplyCard[];
        extractMeta?: { kind: string; fileName: string; pageCount?: number; warnings: string[] };
        warnings?: string[];
      };
      if (res.status === 402) {
        setError(data.error || t("errors.planUpgrade"));
        setPhase("idle");
        return;
      }
      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : t("errors.parseFailed", { status: res.status })
        );
        setPhase("idle");
        return;
      }
      if (!data.ok || !Array.isArray(data.cards) || data.cards.length === 0) {
        setError(t("errors.emptyCards"));
        setPhase("idle");
        return;
      }
      const list = data.cards as ApplyCard[];
      setRows(list.map((c, i) => newRow(c, i)));
      setExtractMeta(
        data.extractMeta ?? { kind: "file", fileName: file?.name || "pasted", warnings: [] }
      );
      setParseWarnings(Array.isArray(data.warnings) ? data.warnings : []);
      setPhase("ready");
    } catch {
      setError(t("errors.network"));
      setPhase("idle");
    }
  }, [boardId, file, pasted, getHeaders, t]);

  const setRow = useCallback((i: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }, []);

  const runApply = useCallback(async () => {
    const cards = rows.filter((r) => r.include).map(({ _key, include, ...c }) => c);
    if (cards.length < 1) {
      setError(t("errors.noneSelected"));
      return;
    }
    setError(null);
    setPhase("applying");
    try {
      const res = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}/list-import/apply`, {
        method: "POST",
        body: JSON.stringify({ cards }),
        headers: getApiHeaders(getHeaders()),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        newCardIds?: string[];
        cardsAdded?: number;
      };
      if (res.status === 402) {
        setError(data.error || t("errors.planUpgrade"));
        setPhase("ready");
        return;
      }
      if (!res.ok) {
        setError(data.error || t("errors.applyFailed", { status: res.status }));
        setPhase("ready");
        return;
      }
      const newIds = Array.isArray(data.newCardIds) ? data.newCardIds : [];
      await onBoardReload();

      if (enrichAfter && newIds.length > 0) {
        setPhase("enriching");
        const toEnrich = newIds.slice(0, LIST_IMPORT_ENRICH_MAX);
        const rest = newIds.length - toEnrich.length;
        if (rest > 0) {
          setEnrichNote(t("enrich.truncated", { max: LIST_IMPORT_ENRICH_MAX, rest }));
        } else {
          setEnrichNote(null);
        }
        setEnrichProgress({ current: 0, total: toEnrich.length });
        const patches: Array<{
          id: string;
          bucket: string;
          priority: string;
          desc: string;
          tags: string[];
          direction: string | null;
          dueDate: string | null;
        }> = [];
        for (let i = 0; i < toEnrich.length; i++) {
          const id = toEnrich[i]!;
          setEnrichProgress({ current: i + 1, total: toEnrich.length });
          const snap = useBoardStore.getState().db as BoardData | null;
          const card = snap?.cards?.find((c) => c.id === id);
          if (!card) continue;
          const headersJ = getApiHeaders(getHeaders());
          try {
            const er = await fetch(
              `/api/boards/${encodeURIComponent(boardId)}/smart-card-enrich`,
              {
                method: "POST",
                credentials: "same-origin",
                headers: { ...headersJ, "Content-Type": "application/json" },
                body: JSON.stringify({
                  title: card.title,
                  knownTags: labelPalette.length ? labelPalette : card.tags,
                }),
              }
            );
            const ed = (await er.json().catch(() => ({}))) as {
              bucketKey?: string;
              priority?: string;
              tags?: string[];
              description?: string;
              direction?: string | null;
              dueDate?: string | null;
            };
            if (!er.ok) continue;
            const bucketSet = new Set(bucketOptions);
            const nextBucket =
              ed.bucketKey && bucketSet.has(ed.bucketKey) ? ed.bucketKey : (card.bucket as string);
            const nextDesc = String(ed.description || "").trim() || card.desc;
            const nextPrio = ["Urgente", "Importante", "Média"].includes(String(ed.priority))
              ? (ed.priority as string)
              : card.priority;
            const nextTags = Array.isArray(ed.tags) ? ed.tags.map(String).filter(Boolean).slice(0, 8) : card.tags;
            const dirRaw = typeof ed.direction === "string" ? ed.direction.trim() : "";
            const dirLower = dirRaw.toLowerCase();
            const nextDir = directionStorageValues.some((d) => d === dirLower) ? dirLower : card.direction;
            const nextDue = String(ed.dueDate || "").trim() || (card.dueDate ?? null);
            patches.push({
              id,
              bucket: nextBucket,
              priority: nextPrio,
              desc: nextDesc,
              tags: nextTags,
              direction: nextDir,
              dueDate: nextDue,
            });
          } catch {
            // continue queue
          }
          await new Promise((r) => setTimeout(r, ENRICH_DELAY_MS));
        }
        if (patches.length > 0) {
          useBoardStore.getState().updateDb((d) => {
            for (const p of patches) {
              const j = d.cards.findIndex((c) => c.id === p.id);
              if (j < 0) continue;
              d.cards[j].bucket = p.bucket;
              d.cards[j].priority = p.priority;
              d.cards[j].desc = p.desc;
              d.cards[j].tags = p.tags;
              d.cards[j].direction = p.direction;
              d.cards[j].dueDate = p.dueDate;
            }
          });
          callBoardPersist();
        }
        setEnrichProgress(null);
        pushToast({ kind: "success", title: t("toasts.appliedWithEnrich", { n: newIds.length }) });
      } else {
        pushToast({ kind: "success", title: t("toasts.applied", { n: data.cardsAdded ?? cards.length }) });
      }
      onClose();
    } catch {
      setError(t("errors.network"));
      setPhase("ready");
    }
  }, [
    rows,
    boardId,
    getHeaders,
    onClose,
    onBoardReload,
    enrichAfter,
    bucketOptions,
    directionStorageValues,
    labelPalette,
    t,
    pushToast,
  ]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[var(--flux-z-modal-critical)] flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm"
      role="dialog"
      aria-modal
      aria-labelledby="pdf-list-import-title"
    >
      <div className="w-full max-w-4xl max-h-[min(90vh,920px)] flex flex-col rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-25)] bg-[var(--flux-surface-card)] shadow-[0_20px_50px_var(--flux-black-alpha-45)]">
        <div className="shrink-0 p-5 border-b border-[var(--flux-border-subtle)]">
          <h2 id="pdf-list-import-title" className="text-lg font-semibold text-[var(--flux-text)] font-display">
            {t("title")}
          </h2>
          <p className="text-sm text-[var(--flux-text-muted)] mt-1">{t("description")}</p>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          {phase === "idle" || phase === "parsing" ? (
            <>
              <div>
                <label className="block text-xs font-medium text-[var(--flux-text-muted)] mb-1.5">
                  {t("fileLabel")}
                </label>
                <input
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="text-sm w-full"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--flux-text-muted)] mb-1.5">
                  {t("pasteLabel")}
                </label>
                <textarea
                  className="w-full min-h-[100px] rounded-md border border-[var(--flux-border-default)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] text-sm p-2"
                  placeholder={t("pastePlaceholder")}
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                />
              </div>
            </>
          ) : null}
          {extractMeta && phase !== "idle" && phase !== "parsing" ? (
            <div className="text-xs text-[var(--flux-text-muted)] rounded-md bg-[var(--flux-surface-elevated)] p-2">
              <span className="font-medium text-[var(--flux-text)]">{t("sourceMeta", { name: extractMeta.fileName })}</span>
              {extractMeta.pageCount != null ? <span> · {t("pages", { n: extractMeta.pageCount })}</span> : null}
              {parseWarnings.length + extractMeta.warnings.length > 0
                ? ` · ${[...parseWarnings, ...extractMeta.warnings].join(" · ")}`
                : null}
            </div>
          ) : null}
          {rows.length > 0 && (phase === "ready" || phase === "applying" || phase === "enriching") ? (
            <div className="space-y-2">
              <p className="text-sm text-[var(--flux-text)]">{t("previewHint", { count: rows.length })}</p>
              <div className="border border-[var(--flux-border-subtle)] rounded-md overflow-x-auto max-h-[min(50vh,420px)]">
                <table className="w-full text-sm text-left min-w-[720px]">
                  <thead className="bg-[var(--flux-surface-elevated)] sticky top-0 z-10 text-[var(--flux-text-muted)] text-xs">
                    <tr>
                      <th className="p-2 w-8">
                        <span className="sr-only">Incluir</span>
                      </th>
                      <th className="p-2">{t("col.title")}</th>
                      <th className="p-2">{t("col.column")}</th>
                      <th className="p-2">{t("col.priority")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={row._key} className="border-t border-[var(--flux-border-subtle)]">
                        <td className="p-1">
                          <input
                            type="checkbox"
                            checked={row.include}
                            onChange={(e) => setRow(i, { include: e.target.checked })}
                            aria-label={t("includeAria")}
                          />
                        </td>
                        <td className="p-1">
                          <input
                            className="w-full min-w-0 text-[var(--flux-text)] bg-transparent border border-transparent focus:border-[var(--flux-border-default)] rounded px-1 py-0.5"
                            value={row.title}
                            onChange={(e) => setRow(i, { title: e.target.value.slice(0, 300) })}
                          />
                        </td>
                        <td className="p-1">
                          <select
                            className="w-full min-w-[140px] text-[var(--flux-text)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-border-default)] rounded text-xs"
                            value={row.bucketKey}
                            onChange={(e) => setRow(i, { bucketKey: e.target.value })}
                          >
                            {bucketOptions.map((k) => (
                              <option key={k} value={k}>
                                {k}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-1">
                          <select
                            className="w-full min-w-[120px] text-[var(--flux-text)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-border-default)] rounded text-xs"
                            value={row.priority}
                            onChange={(e) => setRow(i, { priority: e.target.value })}
                          >
                            {["Urgente", "Importante", "Média"].map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <label className="flex items-start gap-2 text-sm text-[var(--flux-text)] cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={enrichAfter}
                  onChange={(e) => setEnrichAfter(e.target.checked)}
                />
                <span>{t("enrich.checkbox", { max: LIST_IMPORT_ENRICH_MAX })}</span>
              </label>
            </div>
          ) : null}
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
          {phase === "enriching" && enrichProgress ? (
            <p className="text-sm text-[var(--flux-text-muted)]">
              {t("enrich.progress", { current: enrichProgress.current, total: enrichProgress.total })}
            </p>
          ) : null}
          {enrichNote ? <p className="text-sm text-amber-600/90 dark:text-amber-400/90">{enrichNote}</p> : null}
        </div>
        <div className="shrink-0 p-4 border-t border-[var(--flux-border-subtle)] flex items-center justify-end gap-2">
          <button
            type="button"
            className="btn-ghost"
            onClick={onClose}
            disabled={phase === "parsing" || phase === "applying" || phase === "enriching"}
          >
            {t("actions.cancel")}
          </button>
          {phase === "idle" || phase === "parsing" ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => void runParse()}
              disabled={phase === "parsing" || (!file && !pasted.trim())}
            >
              {phase === "parsing" ? t("actions.analyzing") : t("actions.analyze")}
            </button>
          ) : null}
          {phase === "ready" || phase === "applying" || phase === "enriching" ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => void runApply()}
              disabled={phase === "applying" || phase === "enriching" || rows.filter((r) => r.include).length < 1}
            >
              {phase === "applying" || phase === "enriching" ? t("actions.working") : t("actions.apply")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
