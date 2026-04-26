"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import "./forge-tokens.css";

const NAV = [
  { href: "/forge", labelKey: "homeTitle" as const, icon: "⌂" },
  { href: "/forge/runs", labelKey: "runs" as const, icon: "⎘" },
  { href: "/forge/repos", labelKey: "repos" as const, icon: "⎇" },
  { href: "/forge/policies", labelKey: "policies" as const, icon: "⚙" },
  { href: "/forge/insights", labelKey: "insights" as const, icon: "▦" },
  { href: "/forge/onboarding", labelKey: "onboarding" as const, icon: "?" },
];

export function ForgeStudioShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const locale = useLocale();
  const root = `/${locale}`;
  const t = useTranslations("forgePage");
  const norm = pathname.replace(/^\/(pt-BR|en)/, "") || "/";

  return (
    <div className="flex h-[calc(100dvh-0px)] min-h-0 w-full min-w-0 flex-col bg-[var(--flux-surface-dark)]">
      <div className="flex min-h-0 min-w-0 flex-1">
        <nav
          className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-[var(--flux-chrome-alpha-08)] py-3"
          style={{ background: "var(--forge-rail-bg)" }}
          aria-label="Forge"
        >
          {NAV.map((item) => {
            const full = `${root}${item.href}`;
            const active = norm === item.href || (item.href !== "/forge" && norm.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={full}
                title={t(item.labelKey)}
                className={`flex h-10 w-10 items-center justify-center rounded-lg text-sm font-semibold transition-colors ${
                  active
                    ? "bg-[var(--flux-primary-alpha-20)] text-[var(--flux-primary-light)] shadow-[var(--forge-glow)]"
                    : "text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-06)] hover:text-[var(--flux-text)]"
                }`}
              >
                <span aria-hidden>{item.icon}</span>
              </Link>
            );
          })}
        </nav>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-black-alpha-04)] px-4 backdrop-blur-md">
            <div className="min-w-0 truncate font-display text-sm font-semibold text-[var(--flux-text)]">
              <span className="text-[var(--flux-text-muted)]">Forge</span>
              {norm.startsWith("/forge/runs/") ? (
                <span className="text-[var(--flux-text-muted)]"> › </span>
              ) : null}
              <span className="font-mono text-xs text-[var(--flux-primary-light)]">{norm.replace("/forge", "") || " /"}</span>
            </div>
            <button
              type="button"
              className="rounded-lg bg-[var(--flux-primary)] px-3 py-1.5 text-xs font-semibold text-white"
              onClick={() => window.dispatchEvent(new CustomEvent("flux-forge-new-run"))}
            >
              {t("newRun")}
            </button>
          </header>
          <div className="flex min-h-0 min-w-0 flex-1">
            <main className="forge-panel-bg min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-4 md:p-6">
              {children}
            </main>
            <aside className="hidden w-[min(380px,32vw)] shrink-0 border-l border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-mid)]/90 p-4 max-lg:hidden">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--flux-text-muted)]">
                {t("inspector")}
              </p>
              <p className="mt-2 text-xs text-[var(--flux-text-muted)]">
                Contexto da run (modelo, tokens, chunks RAG) aparece ao abrir uma run individual.
              </p>
            </aside>
          </div>
          <footer className="flex h-8 shrink-0 items-center justify-between border-t border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-black-alpha-04)] px-4 text-[10px] text-[var(--flux-text-muted)]">
            <span>
              {t("statusBarModel")}: <span className="font-mono text-[var(--flux-text)]">Anthropic / OpenAI-compat</span>
            </span>
            <span>
              {t("statusBarCost")}: <span className="font-mono">—</span>
            </span>
          </footer>
        </div>
      </div>
    </div>
  );
}
