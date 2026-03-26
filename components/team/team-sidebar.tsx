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
    <aside className="w-64 shrink-0 border-r border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-card)] p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">Equipe</p>
      <nav className="space-y-1">
        {links.map((l) => {
          const active = normalized.startsWith("/equipe") && l.tab === tab;
          return (
            <Link
              key={l.href}
              href={`/${locale}${l.href}`}
              className={`block rounded-lg px-3 py-2 text-sm ${active ? "bg-[var(--flux-primary-alpha-20)] text-[var(--flux-primary-light)]" : "text-[var(--flux-text-muted)] hover:bg-[var(--flux-primary-alpha-08)] hover:text-[var(--flux-text)]"}`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
