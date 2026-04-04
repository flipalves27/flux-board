"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const links = [
  { href: "/equipe?tab=membros", label: "Membros", tab: "membros" },
  { href: "/equipe?tab=funcoes", label: "Funções", tab: "funcoes" },
  { href: "/equipe?tab=acessos", label: "Acessos", tab: "acessos" },
];

export function TeamSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = pathname.split("/")[1] === "en" ? "en" : "pt-BR";
  const normalized = pathname.replace(/^\/(pt-BR|en)(?=\/|$)/, "") || "/";
  const tab = searchParams.get("tab") || "membros";
  return (
    <aside className="relative z-[1] w-64 shrink-0 border-r border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-card)] p-4">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.13em] text-[var(--flux-text-muted)]">Equipe</p>
      <nav className="space-y-1.5">
        {links.map((l) => {
          const active = normalized.startsWith("/equipe") && l.tab === tab;
          return (
            <Link
              key={l.href}
              href={`/${locale}${l.href}`}
              className={`relative block border-y-0 border-r-0 border-l-2 px-3 py-2 text-sm font-medium transition-all duration-200 rounded-r-lg ${
                active
                  ? "border-l-[var(--flux-primary-light)] bg-[var(--flux-primary-alpha-08)] text-[var(--flux-text)]"
                  : "border-l-transparent text-[var(--flux-text-muted)] hover:bg-[var(--flux-primary-alpha-05)] hover:text-[var(--flux-text)]"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
