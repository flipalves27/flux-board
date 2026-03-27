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
    <aside className="w-64 shrink-0 border-r border-[var(--flux-primary-alpha-10)] bg-[linear-gradient(180deg,var(--flux-surface-mid),color-mix(in_srgb,var(--flux-surface-mid)_90%,var(--flux-primary)_10%))] p-4">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.13em] text-[var(--flux-text-muted)]">Equipe</p>
      <nav className="space-y-1.5">
        {links.map((l) => {
          const active = normalized.startsWith("/equipe") && l.tab === tab;
          return (
            <Link
              key={l.href}
              href={`/${locale}${l.href}`}
              className={`relative block rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-200 ${
                active
                  ? "border-[var(--flux-primary-alpha-25)] bg-[linear-gradient(135deg,var(--flux-primary-alpha-20),var(--flux-primary-alpha-10))] text-[var(--flux-primary-light)] shadow-[0_6px_20px_var(--flux-primary-alpha-12)]"
                  : "border-transparent text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-12)] hover:bg-[var(--flux-primary-alpha-08)] hover:text-[var(--flux-text)]"
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
