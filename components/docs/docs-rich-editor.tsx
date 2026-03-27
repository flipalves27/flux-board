"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useImperativeHandle, forwardRef } from "react";
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
};

export const DocsRichEditor = forwardRef<DocsRichEditorHandle, Props>(function DocsRichEditor(
  { docId, initialMarkdown, placeholder, editable, onMarkdownChange, toolbarLabels },
  ref
) {
  const editor = useEditor(
    {
      immediatelyRender: false,
      editable,
      extensions: createDocsEditorExtensions(placeholder),
      content: initialMarkdown,
      contentType: "markdown",
      editorProps: {
        attributes: {
          class:
            "flux-docs-prosemirror min-h-[50vh] w-full max-w-none px-3 py-3 text-sm text-[var(--flux-text)] outline-none focus:outline-none",
        },
      },
      onUpdate: ({ editor: ed }) => {
        onMarkdownChange(ed.getMarkdown());
      },
    },
    [docId]
  );

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

  return (
    <div className="rounded border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)]">
      {editable ? <DocsEditorToolbar editor={editor} labels={toolbarLabels} /> : null}
      {!editor ? (
        <div className="min-h-[50vh] w-full animate-pulse bg-[var(--flux-surface-card)]" aria-hidden />
      ) : (
        <EditorContent editor={editor} />
      )}
    </div>
  );
});
