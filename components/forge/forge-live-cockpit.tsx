"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";

export function ForgeLiveCockpit({ runId }: { runId: string }) {
  const locale = useLocale();
  const t = useTranslations("forgePage");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        window.location.href = `/${locale}/forge/runs/${encodeURIComponent(runId)}`;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [locale, runId]);

  return (
    <div className="fixed inset-0 z-[var(--flux-z-modal)] flex flex-col bg-[#07060f] text-[var(--flux-text)]">
      <div className="pointer-events-none absolute inset-0 opacity-40 forge-anim-pulse bg-[radial-gradient(ellipse_at_center,color-mix(in_srgb,var(--flux-primary)_22%,transparent),transparent_70%)]" />
      <header className="relative z-10 flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h1 className="font-display text-sm font-bold tracking-wide">{t("liveMode")}</h1>
        <Link
          href={`/${locale}/forge/runs/${encodeURIComponent(runId)}`}
          className="text-xs font-semibold text-[var(--flux-primary-light)]"
        >
          Esc · exit
        </Link>
      </header>
      <div className="relative z-10 grid flex-1 grid-cols-1 gap-3 p-4 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur-md">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--flux-text-muted)]">Plan</p>
          <p className="mt-2 text-xs text-[var(--flux-text-muted)]">Streaming do plano e tentativas autónomas (árvore).</p>
        </div>
        <div className="rounded-xl border border-[var(--flux-primary-alpha-35)] bg-black/40 p-4 shadow-[var(--forge-glow)] backdrop-blur-md md:col-span-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--flux-primary-light)]">Timeline</p>
          <div className="mt-4 h-48 rounded-lg border border-dashed border-white/15" />
        </div>
        <div className="rounded-xl border border-white/10 bg-black/30 p-4 font-mono text-[10px] backdrop-blur-md">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--flux-text-muted)]">Logs</p>
          <pre className="mt-2 max-h-56 overflow-auto text-[var(--flux-text-muted)]">
            run {runId}
            {"\n"}[forge] live cockpit placeholder
          </pre>
        </div>
      </div>
    </div>
  );
}
