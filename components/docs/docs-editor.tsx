"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { DocData } from "@/lib/docs-types";
import { TeamWorkspacePanel } from "@/components/team/team-workspace-panel";
import { DocsRichEditor, type DocsRichEditorHandle } from "@/components/docs/docs-rich-editor";
import { DocsMarkdownPreview } from "@/components/docs/docs-markdown-preview";
import { DocsAiBanner, DocsEditorHint } from "@/components/docs/docs-editor-hint";

type SaveStatus = "idle" | "saving" | "saved" | "error";

type Props = {
  doc: DocData | null;
  getHeaders: () => Record<string, string>;
  onSaved: (doc: DocData) => void;
  onDelete: (docId: string) => void;
};

export function DocsEditor({ doc, getHeaders, onSaved, onDelete }: Props) {
  const t = useTranslations("docsPage");
  const locale = useLocale();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const saveTimerRef = useRef<number | null>(null);
  const richRef = useRef<DocsRichEditorHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (!doc) {
      setTitle("");
      setContent("");
      setSaveStatus("idle");
      return;
    }
    setTitle(doc.title);
    setContent(doc.contentMd);
    setSaveStatus("idle");
  }, [doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- reset draft only when switching doc id

  const performSave = useCallback(async () => {
    if (!doc) return;
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
  }, [title, content, doc, getHeaders, onSaved]);

  useEffect(() => {
    if (!doc) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void performSave();
    }, 700);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [title, content, doc?.id, performSave]); // eslint-disable-line react-hooks/exhaustive-deps -- schedule save when draft changes; omit `doc` object to avoid extra runs on metadata-only updates

  const saveNow = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    void performSave();
  }, [performSave]);

  const formatUpdated = useCallback(
    (iso: string) => {
      try {
        const d = new Date(iso);
        return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(d);
      } catch {
        return iso;
      }
    },
    [locale]
  );

  const exportMarkdown = useCallback(() => {
    if (!doc) return;
    const name = `${doc.slug || "doc"}.md`;
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }, [doc, content]);

  const onImportFile = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result ?? "");
        if (content.trim() && !window.confirm(t("importConfirm"))) return;
        richRef.current?.setMarkdown(text);
      };
      reader.readAsText(file, "UTF-8");
    },
    [content, t]
  );

  if (!doc) {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <TeamWorkspacePanel>
          <div className="text-center">
            <h2 className="text-lg font-semibold text-[var(--flux-text)]">{t("empty.title")}</h2>
            <p className="mt-2 text-sm text-[var(--flux-text-muted)]">{t("empty.subtitle")}</p>
            <ol className="mx-auto mt-6 max-w-md list-decimal space-y-3 pl-5 text-left text-sm text-[var(--flux-text-muted)]">
              <li>{t("empty.step1")}</li>
              <li>{t("empty.step2")}</li>
              <li>{t("empty.step3")}</li>
            </ol>
          </div>
        </TeamWorkspacePanel>
      </div>
    );
  }

  const toolbarLabels = {
    bold: t("toolbar.bold"),
    italic: t("toolbar.italic"),
    strike: t("toolbar.strike"),
    code: t("toolbar.code"),
    h1: t("toolbar.h1"),
    h2: t("toolbar.h2"),
    h3: t("toolbar.h3"),
    bulletList: t("toolbar.bulletList"),
    orderedList: t("toolbar.orderedList"),
    taskList: t("toolbar.taskList"),
    blockquote: t("toolbar.blockquote"),
    codeBlock: t("toolbar.codeBlock"),
    horizontalRule: t("toolbar.horizontalRule"),
    link: t("toolbar.link"),
    linkPrompt: t("toolbar.linkPrompt"),
    table: t("toolbar.table"),
    undo: t("toolbar.undo"),
    redo: t("toolbar.redo"),
  };

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <DocsAiBanner contentEmpty={!content.trim()} />
      <DocsEditorHint />

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--flux-text-muted)]">
          <span>
            {saveStatus === "saving"
              ? t("save.saving")
              : saveStatus === "saved"
                ? t("save.saved")
                : saveStatus === "error"
                  ? t("save.error")
                  : t("save.idle")}
          </span>
          <span className="text-[var(--flux-chrome-alpha-12)]">·</span>
          <span>{t("save.lastUpdated", { date: formatUpdated(doc.updatedAt) })}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={saveNow}>
            {t("save.now")}
          </button>
          <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => fileInputRef.current?.click()}>
            {t("import")}
          </button>
          <input ref={fileInputRef} type="file" accept=".md,.markdown,text/markdown,text/plain" className="hidden" onChange={onImportFile} />
          <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={exportMarkdown}>
            {t("export")}
          </button>
          <button type="button" className="btn-danger px-2 py-1 text-xs" onClick={() => onDelete(doc.id)}>
            {t("delete")}
          </button>
        </div>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="mb-3 w-full rounded border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-base font-semibold text-[var(--flux-text)]"
        placeholder={t("titlePlaceholder")}
      />

      <div className="mb-2 flex gap-1 rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] p-1">
        <button
          type="button"
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            tab === "edit" ? "bg-[var(--flux-primary-alpha-20)] text-[var(--flux-primary-light)]" : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
          }`}
          onClick={() => setTab("edit")}
        >
          {t("tab.edit")}
        </button>
        <button
          type="button"
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            tab === "preview" ? "bg-[var(--flux-primary-alpha-20)] text-[var(--flux-primary-light)]" : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
          }`}
          onClick={() => setTab("preview")}
        >
          {t("tab.preview")}
        </button>
      </div>

      <div className={tab === "edit" ? "block" : "hidden"} aria-hidden={tab !== "edit"}>
        <DocsRichEditor
          ref={richRef}
          docId={doc.id}
          initialMarkdown={doc.contentMd}
          placeholder={t("editorPlaceholder")}
          editable
          onMarkdownChange={setContent}
          toolbarLabels={toolbarLabels}
        />
      </div>
      <div className={tab === "preview" ? "block" : "hidden"} aria-hidden={tab !== "preview"}>
        <DocsMarkdownPreview markdown={content} emptyLabel={t("previewEmpty")} />
      </div>

      <details className="mt-4 rounded-lg border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-xs text-[var(--flux-text-muted)]">
        <summary className="cursor-pointer font-medium text-[var(--flux-text)]">{t("shortcuts.title")}</summary>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>{t("shortcuts.bold")}</li>
          <li>{t("shortcuts.italic")}</li>
          <li>{t("shortcuts.undo")}</li>
        </ul>
      </details>
    </div>
  );
}
