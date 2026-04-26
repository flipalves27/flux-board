"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { DOCS_TEMPLATE_BY_TYPE } from "@/lib/docs-templates";
import { DOC_TYPES, type DocBacklink, type DocData, type DocType } from "@/lib/docs-types";
import { useOrgFeaturesOptional } from "@/hooks/use-org-features";

type Props = {
  docId: string | null;
  boardIdFromUrl: string | null;
  cardIdFromUrl: string | null;
  selectedDoc: DocData | null;
  getHeaders: () => Record<string, string>;
  onDocPatched: (doc: DocData) => void;
  onAfterMutation: () => void;
  onGeneratedDoc?: (doc: DocData) => void;
};

export function DocsContextPanel({
  docId,
  boardIdFromUrl,
  cardIdFromUrl,
  selectedDoc,
  getHeaders,
  onDocPatched,
  onAfterMutation,
  onGeneratedDoc,
}: Props) {
  const t = useTranslations("docsPage.contextPanel");
  const locale = useLocale();
  const localeRoot = `/${locale}`;
  const orgFeat = useOrgFeaturesOptional();
  const canRag = Boolean(orgFeat?.data?.flux_docs_rag);

  const [backlinks, setBacklinks] = useState<DocBacklink[] | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!docId) {
      setBacklinks(null);
      setError(false);
      return;
    }
    let cancelled = false;
    setBacklinks(null);
    setError(false);
    void (async () => {
      try {
        const res = await fetch(`/api/docs/${encodeURIComponent(docId)}/backlinks`, { headers: getHeaders() });
        const data = (await res.json().catch(() => ({}))) as { backlinks?: DocBacklink[] };
        if (!res.ok) throw new Error("backlinks failed");
        if (!cancelled) setBacklinks(Array.isArray(data.backlinks) ? data.backlinks : []);
      } catch {
        if (!cancelled) {
          setBacklinks([]);
          setError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docId, getHeaders]);

  const putDoc = useCallback(
    async (patch: Partial<DocData>, busyKey: string) => {
      if (!docId) return;
      setBusy(busyKey);
      try {
        const res = await fetch(`/api/docs/${encodeURIComponent(docId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...getHeaders() },
          body: JSON.stringify(patch),
        });
        const data = (await res.json().catch(() => ({}))) as { doc?: DocData };
        if (res.ok && data.doc) onDocPatched(data.doc);
        else throw new Error("put failed");
      } finally {
        setBusy(null);
      }
    },
    [docId, getHeaders, onDocPatched]
  );

  const linkCurrentBoard = useCallback(async () => {
    if (!selectedDoc || !boardIdFromUrl) return;
    if (selectedDoc.boardIds?.includes(boardIdFromUrl)) return;
    const boardIds = [...(selectedDoc.boardIds || []), boardIdFromUrl];
    await putDoc({ boardIds: Array.from(new Set(boardIds)) }, "save");
  }, [boardIdFromUrl, putDoc, selectedDoc]);

  const setDocType = useCallback(
    async (next: DocType) => {
      await putDoc({ docType: next }, "type");
    },
    [putDoc]
  );

  const applyTemplate = useCallback(
    async (templateType: DocType) => {
      if (!docId) return;
      if (selectedDoc?.contentMd?.trim() && !window.confirm(t("templateReplaceConfirm"))) return;
      setBusy("tpl");
      try {
        const contentMd = DOCS_TEMPLATE_BY_TYPE[templateType];
        const res = await fetch(`/api/docs/${encodeURIComponent(docId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...getHeaders() },
          body: JSON.stringify({ contentMd, docType: templateType }),
        });
        const data = (await res.json().catch(() => ({}))) as { doc?: DocData };
        if (res.ok && data.doc) {
          onDocPatched(data.doc);
          onAfterMutation();
        }
      } finally {
        setBusy(null);
      }
    },
    [docId, getHeaders, onAfterMutation, onDocPatched, selectedDoc?.contentMd, t]
  );

  const quickGenerateStatus = useCallback(async () => {
    if (!boardIdFromUrl || !canRag) return;
    setBusy("gen");
    try {
      const res = await fetch("/api/docs/generate-from-board", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getHeaders() },
        body: JSON.stringify({ boardId: boardIdFromUrl }),
      });
      const data = (await res.json().catch(() => ({}))) as { doc?: DocData };
      if (res.ok && data.doc) {
        onAfterMutation();
        onGeneratedDoc?.(data.doc);
      }
    } finally {
      setBusy(null);
    }
  }, [boardIdFromUrl, canRag, getHeaders, onAfterMutation, onGeneratedDoc]);

  const summarizeToCard = useCallback(async () => {
    if (!docId || !boardIdFromUrl || !cardIdFromUrl || !canRag) return;
    setBusy("sum");
    try {
      const res = await fetch(`/api/docs/${encodeURIComponent(docId)}/summarize-to-card`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getHeaders() },
        body: JSON.stringify({ boardId: boardIdFromUrl, cardId: cardIdFromUrl }),
      });
      if (res.ok) onAfterMutation();
    } finally {
      setBusy(null);
    }
  }, [boardIdFromUrl, canRag, cardIdFromUrl, docId, getHeaders, onAfterMutation]);

  return (
    <aside
      className="flex w-full shrink-0 flex-col border-t border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-mid)] p-3 lg:w-[min(360px,36vw)] lg:border-l lg:border-t-0"
      aria-label={t("ariaLabel")}
    >
      {boardIdFromUrl ? (
        <div className="mb-3 rounded-xl border border-[var(--flux-primary-alpha-15)] bg-[var(--flux-primary-alpha-08)] px-3 py-2 text-xs text-[var(--flux-text)]">
          <div className="font-semibold text-[var(--flux-primary-light)]">{t("boardContextTitle")}</div>
          <Link
            href={`${localeRoot}/board/${encodeURIComponent(boardIdFromUrl)}${cardIdFromUrl ? `?card=${encodeURIComponent(cardIdFromUrl)}` : ""}`}
            className="mt-1 inline-flex text-[var(--flux-primary-light)] underline-offset-2 hover:underline"
          >
            {t("backToBoard")}
          </Link>
          {selectedDoc && !selectedDoc.boardIds?.includes(boardIdFromUrl) ? (
            <div className="mt-2">
              <button
                type="button"
                className="btn-primary w-full py-1.5 text-xs"
                disabled={Boolean(busy)}
                onClick={() => void linkCurrentBoard()}
              >
                {t("linkBoardCta")}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {selectedDoc ? (
        <div className="mb-3 space-y-2 rounded-xl border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-chrome-alpha-04)] p-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[var(--flux-text-muted)]">{t("metaTitle")}</div>
          <label className="block text-[11px] text-[var(--flux-text-muted)]" htmlFor="doc-type-select">
            {t("docTypeLabel")}
          </label>
          <select
            id="doc-type-select"
            className="w-full rounded border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-2 py-1.5 text-sm text-[var(--flux-text)]"
            value={selectedDoc.docType}
            disabled={Boolean(busy)}
            onChange={(e) => void setDocType(e.target.value as DocType)}
          >
            {DOC_TYPES.map((d) => (
              <option key={d} value={d}>
                {t(`docTypes.${d}` as const)}
              </option>
            ))}
          </select>

          <div className="pt-1 text-[11px] font-semibold text-[var(--flux-text-muted)]">{t("templatesTitle")}</div>
          <div className="flex flex-wrap gap-1">
            {(["minutes", "prd", "retro", "decision", "briefing"] as const).map((k) => (
              <button
                key={k}
                type="button"
                className="rounded-md border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-2 py-0.5 text-[11px] text-[var(--flux-text)] hover:border-[var(--flux-primary-alpha-25)]"
                disabled={Boolean(busy)}
                onClick={() => void applyTemplate(k)}
              >
                {t(`templatePills.${k}`)}
              </button>
            ))}
          </div>

          {canRag && boardIdFromUrl ? (
            <div className="space-y-1 border-t border-[var(--flux-chrome-alpha-08)] pt-2">
              <div className="text-[11px] font-semibold text-[var(--flux-text-muted)]">{t("aiActionsTitle")}</div>
              <button
                type="button"
                className="btn-secondary w-full py-1.5 text-xs"
                disabled={Boolean(busy)}
                onClick={() => void quickGenerateStatus()}
              >
                {t("generateBoardStatus")}
              </button>
              {cardIdFromUrl ? (
                <button
                  type="button"
                  className="btn-primary w-full py-1.5 text-xs"
                  disabled={Boolean(busy)}
                  onClick={() => void summarizeToCard()}
                >
                  {t("summarizeToCard")}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[var(--flux-text-muted)]">{t("linksTitle")}</div>
      <p className="mt-1 text-xs text-[var(--flux-text-muted)]">{t("linksHint")}</p>

      {!docId ? (
        <div className="mt-4 text-xs text-[var(--flux-text-muted)]">{t("pickDoc")}</div>
      ) : error ? (
        <div className="mt-4 text-xs text-[var(--flux-danger)]">{t("loadError")}</div>
      ) : backlinks === null ? (
        <div className="mt-4 text-xs text-[var(--flux-text-muted)]">{t("loading")}</div>
      ) : backlinks.length === 0 ? (
        <div className="mt-4 text-xs text-[var(--flux-text-muted)]">{t("emptyBacklinks")}</div>
      ) : (
        <ul className="mt-3 max-h-[min(360px,45vh)] space-y-2 overflow-auto pr-1">
          {backlinks.map((bl) => (
            <li
              key={`${bl.boardId}:${bl.cardId}`}
              className="rounded-lg border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-chrome-alpha-04)] px-2.5 py-2"
            >
              <Link
                href={`${localeRoot}/board/${encodeURIComponent(bl.boardId)}?card=${encodeURIComponent(bl.cardId)}`}
                className="block text-sm font-medium text-[var(--flux-text)] hover:text-[var(--flux-primary-light)]"
              >
                {bl.cardTitle}
              </Link>
              <div className="mt-0.5 text-[11px] text-[var(--flux-text-muted)]">{bl.boardName}</div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
