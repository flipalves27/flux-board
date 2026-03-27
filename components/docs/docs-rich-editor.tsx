"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useImperativeHandle, forwardRef, useRef } from "react";
import { createDocsEditorExtensions } from "@/lib/docs-editor-extensions";
import { DocsEditorToolbar } from "@/components/docs/docs-editor-toolbar";

export type DocsRichEditorHandle = {
  setMarkdown: (md: string) => void;
};

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
  docId: string;
  initialMarkdown: string;
  placeholder: string;
  editable: boolean;
  onMarkdownChange: (md: string) => void;
  toolbarLabels: ToolbarLabels;
  /** Card modal: shorter editor, scroll; sync when parent replaces markdown while editor not focused */
  variant?: "default" | "compact";
  /** When true, apply `initialMarkdown` from parent if it differs and focus is outside the editor (e.g. smart enrich). */
  syncExternalMarkdown?: boolean;
};

const editorBodyClass = {
  default: "flux-docs-prosemirror min-h-[50vh] w-full max-w-none px-3 py-3 text-sm text-[var(--flux-text)] outline-none focus:outline-none",
  compact:
    "flux-docs-prosemirror min-h-[140px] max-h-[min(40vh,320px)] overflow-y-auto w-full max-w-none px-3 py-3 text-sm text-[var(--flux-text)] outline-none focus:outline-none scrollbar-kanban",
} as const;

export const DocsRichEditor = forwardRef<DocsRichEditorHandle, Props>(function DocsRichEditor(
  {
    docId,
    initialMarkdown,
    placeholder,
    editable,
    onMarkdownChange,
    toolbarLabels,
    variant = "default",
    syncExternalMarkdown = false,
  },
  ref
) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const editor = useEditor(
    {
      immediatelyRender: false,
      editable,
      extensions: createDocsEditorExtensions(placeholder),
      content: initialMarkdown,
      contentType: "markdown",
      editorProps: {
        attributes: {
          class: editorBodyClass[variant],
        },
      },
      onUpdate: ({ editor: ed }) => {
        onMarkdownChange(ed.getMarkdown());
      },
    },
    [docId]
  );

  useEffect(() => {
    if (!syncExternalMarkdown || !editor) return;
    const active = document.activeElement;
    if (wrapRef.current?.contains(active)) return;
    const cur = editor.getMarkdown();
    if (cur === initialMarkdown) return;
    editor.commands.setContent(initialMarkdown, { contentType: "markdown", emitUpdate: false });
  }, [editor, initialMarkdown, syncExternalMarkdown]);

  useImperativeHandle(
    ref,
    () => ({
      setMarkdown: (md: string) => {
        if (!editor) return;
        editor.commands.setContent(md, { contentType: "markdown" });
        onMarkdownChange(editor.getMarkdown());
      },
    }),
    [editor, onMarkdownChange]
  );

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  const skeletonH = variant === "compact" ? "min-h-[140px]" : "min-h-[50vh]";

  return (
    <div ref={wrapRef} className="rounded border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)]">
      {editable ? <DocsEditorToolbar editor={editor} labels={toolbarLabels} /> : null}
      {!editor ? (
        <div className={`${skeletonH} w-full animate-pulse bg-[var(--flux-surface-card)]`} aria-hidden />
      ) : (
        <EditorContent editor={editor} />
      )}
    </div>
  );
});
