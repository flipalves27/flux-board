"use client";

import type { ReactNode } from "react";
import type { Editor } from "@tiptap/core";

type Labels = {
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
  editor: Editor | null;
  labels: Labels;
};

function ToolbarBtn({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-[var(--flux-primary-alpha-20)] text-[var(--flux-primary-light)]"
          : "text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-08)] hover:text-[var(--flux-text)]"
      } disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

export function DocsEditorToolbar({ editor, labels }: Props) {
  if (!editor) return null;

  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt(labels.linkPrompt, prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <div
      className="flex flex-wrap items-center gap-0.5 border-b border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-2 py-1.5"
      role="toolbar"
      aria-label="Formatting"
    >
      <ToolbarBtn title={labels.undo} onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
        ↺
      </ToolbarBtn>
      <ToolbarBtn title={labels.redo} onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
        ↻
      </ToolbarBtn>
      <span className="mx-1 h-4 w-px bg-[var(--flux-chrome-alpha-12)]" aria-hidden />
      <ToolbarBtn title={labels.bold} active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        B
      </ToolbarBtn>
      <ToolbarBtn title={labels.italic} active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <em>I</em>
      </ToolbarBtn>
      <ToolbarBtn title={labels.strike} active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
        S̶
      </ToolbarBtn>
      <ToolbarBtn title={labels.code} active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}>
        {"</>"}
      </ToolbarBtn>
      <span className="mx-1 h-4 w-px bg-[var(--flux-chrome-alpha-12)]" aria-hidden />
      <ToolbarBtn title={labels.h1} active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
        H1
      </ToolbarBtn>
      <ToolbarBtn title={labels.h2} active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        H2
      </ToolbarBtn>
      <ToolbarBtn title={labels.h3} active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        H3
      </ToolbarBtn>
      <span className="mx-1 h-4 w-px bg-[var(--flux-chrome-alpha-12)]" aria-hidden />
      <ToolbarBtn title={labels.bulletList} active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        •
      </ToolbarBtn>
      <ToolbarBtn title={labels.orderedList} active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        1.
      </ToolbarBtn>
      <ToolbarBtn title={labels.taskList} active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}>
        ☐
      </ToolbarBtn>
      <ToolbarBtn title={labels.blockquote} active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        “
      </ToolbarBtn>
      <ToolbarBtn title={labels.codeBlock} active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
        {"{ }"}
      </ToolbarBtn>
      <ToolbarBtn title={labels.horizontalRule} onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        —
      </ToolbarBtn>
      <span className="mx-1 h-4 w-px bg-[var(--flux-chrome-alpha-12)]" aria-hidden />
      <ToolbarBtn title={labels.link} active={editor.isActive("link")} onClick={setLink}>
        URL
      </ToolbarBtn>
      <ToolbarBtn
        title={labels.table}
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      >
        ▦
      </ToolbarBtn>
    </div>
  );
}
