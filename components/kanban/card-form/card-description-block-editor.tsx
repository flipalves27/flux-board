"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { DocsRichEditor } from "@/components/docs/docs-rich-editor";

type ToolbarLabels = {
  bold: string;
  italic: string;
  strike: string;
  code: string;
  h1: string;
  h2: string;
  h3: string;
  bulletList: string;
  orderedList: string;
  taskList: string;
  blockquote: string;
  codeBlock: string;
  horizontalRule: string;
  link: string;
  linkPrompt: string;
  table: string;
  undo: string;
  redo: string;
};

type Props = {
  editorKey: string;
  blockLabel: string;
  placeholder: string;
  value: string;
  onChange: (markdown: string) => void;
  defaultOpen?: boolean;
};

export function CardDescriptionBlockEditor({
  editorKey,
  blockLabel,
  placeholder,
  value,
  onChange,
  defaultOpen = false,
}: Props) {
  const t = useTranslations("docsPage");
  const [open, setOpen] = useState(defaultOpen);
  const [mounted, setMounted] = useState(defaultOpen);
  const toolbarLabels: ToolbarLabels = {
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

  const onToggle = useCallback((e: React.SyntheticEvent<HTMLDetailsElement>) => {
    const next = e.currentTarget.open;
    setOpen(next);
    if (next) setMounted(true);
  }, []);

  return (
    <details
      open={open}
      onToggle={onToggle}
      className="group rounded-xl border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-black-alpha-06)] transition-[border-color] duration-200 hover:border-[var(--flux-primary-alpha-18)]"
    >
      <summary className="cursor-pointer list-none px-3 py-2.5 font-display text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)] [&::-webkit-details-marker]:hidden flex items-center justify-between gap-2">
        <span>{blockLabel}</span>
        <span className="text-[10px] font-normal text-[var(--flux-text-muted)]/80 group-open:rotate-180 transition-transform" aria-hidden>
          ▾
        </span>
      </summary>
      <div className="border-t border-[var(--flux-chrome-alpha-08)] px-2 pb-2 pt-1">
        {!mounted ? (
          <p className="px-1 py-2 text-xs text-[var(--flux-text-muted)]">{t("cardBlock.expandToEdit")}</p>
        ) : (
          <DocsRichEditor
            docId={editorKey}
            initialMarkdown={value}
            placeholder={placeholder}
            editable
            onMarkdownChange={onChange}
            toolbarLabels={toolbarLabels}
            variant="compact"
            syncExternalMarkdown
          />
        )}
      </div>
    </details>
  );
}
