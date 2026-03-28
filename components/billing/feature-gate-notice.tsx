"use client";

import Link from "next/link";

type Props = {
  title: string;
  description: string;
  ctaLabel?: string;
  ctaHref?: string;
};

export function FeatureGateNotice({ title, description, ctaLabel = "Ver planos", ctaHref = "/billing" }: Props) {
  return (
    <div className="rounded-[var(--flux-rad-xl)] border border-[var(--flux-gold-alpha-35)] bg-[var(--flux-gold-alpha-08)] p-6 shadow-[var(--flux-shadow-sm)] transition-[box-shadow,border-color] duration-300 ease-out">
      <h2 className="font-display font-bold text-xl tracking-tight text-[var(--flux-text)]">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--flux-text-muted)]">{description}</p>
      <div className="mt-6">
        <Link href={ctaHref} className="btn-primary inline-flex">
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}
