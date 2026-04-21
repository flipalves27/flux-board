"use client";

import Link from "next/link";

type ReportsLssPanelProps = {
  blurb: string;
  cta: string;
  href: string;
};

export function ReportsLssPanel({ blurb, cta, href }: ReportsLssPanelProps) {
  return (
    <div className="rounded-[var(--flux-rad)] border border-[var(--flux-secondary-alpha-28)] bg-[var(--flux-surface-card)] p-6">
      <p className="text-sm leading-relaxed text-[var(--flux-text-muted)]">{blurb}</p>
      <Link
        href={href}
        className="mt-4 inline-flex rounded-[var(--flux-rad-sm)] border border-[var(--flux-secondary-alpha-35)] bg-[var(--flux-secondary-alpha-10)] px-4 py-2 text-xs font-semibold text-[var(--flux-primary-light)] hover:border-[var(--flux-primary)]"
      >
        {cta}
      </Link>
    </div>
  );
}

