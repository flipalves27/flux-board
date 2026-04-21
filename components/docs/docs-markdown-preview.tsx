"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import type { ReactNode } from "react";

type Props = {
  markdown: string;
  emptyLabel: string;
};

export function DocsMarkdownPreview({ markdown, emptyLabel }: Props) {
  const trimmed = markdown.trim();
  if (!trimmed) {
    return <p className="text-sm text-[var(--flux-text-muted)]">{emptyLabel}</p>;
  }

  return (
    <div className="docs-markdown-preview flux-docs-prose max-h-[70vh] overflow-y-auto rounded border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] p-4 text-[var(--flux-text)]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={markdownComponents}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

const markdownComponents = {
  a({ href, children }: { href?: string; children?: ReactNode }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--flux-primary-light)] underline underline-offset-2 hover:opacity-90">
        {children}
      </a>
    );
  },
  code({ className, children, ...props }: { className?: string; children?: ReactNode }) {
    const inline = !className;
    return inline ? (
      <code className="rounded bg-[var(--flux-chrome-alpha-08)] px-1 py-0.5 font-mono text-[0.9em]" {...props}>
        {children}
      </code>
    ) : (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
  pre({ children }: { children?: ReactNode }) {
    return <pre className="overflow-x-auto rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] p-3 font-mono text-sm">{children}</pre>;
  },
};
