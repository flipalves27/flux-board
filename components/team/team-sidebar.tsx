"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useNavigationVariant, useNavigationVariantActions } from "@/context/navigation-variant-context";
import { useTranslations } from "next-intl";

const links = [
  { href: "/equipe?tab=membros", label: "Membros", tab: "membros" },
  { href: "/equipe?tab=funcoes", label: "Funções", tab: "funcoes" },
  { href: "/equipe?tab=acessos", label: "Acessos", tab: "acessos" },
];

export function TeamSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navVariant = useNavigationVariant();
  const navActions = useNavigationVariantActions();
  const isMinimal = navVariant === "minimal";
  const t = useTranslations("navigation");
  const locale = pathname.split("/")[1] === "en" ? "en" : "pt-BR";
  const normalized = pathname.replace(/^\/(pt-BR|en)(?=\/|$)/, "") || "/";
  const tab = searchParams.get("tab") || "membros";
  return (
    <aside
      className={`w-64 shrink-0 border-r p-4 ${
        isMinimal
          ? "border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-card)]"
          : "border-[var(--flux-primary-alpha-10)] bg-[linear-gradient(180deg,var(--flux-surface-mid),color-mix(in_srgb,var(--flux-surface-mid)_90%,var(--flux-primary)_10%))]"
      }`}
    >
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.13em] text-[var(--flux-text-muted)]">Equipe</p>
      <nav className="space-y-1.5">
        {links.map((l) => {
          const active = normalized.startsWith("/equipe") && l.tab === tab;
          return (
            <Link
              key={l.href}
              href={`/${locale}${l.href}`}
              className={`relative block text-sm font-medium transition-all duration-200 ${
                isMinimal
                  ? `border-y-0 border-r-0 border-l-2 px-3 py-2 rounded-r-lg ${
                      active
                        ? "border-l-[var(--flux-primary-light)] bg-[var(--flux-primary-alpha-08)] text-[var(--flux-text)]"
                        : "border-l-transparent text-[var(--flux-text-muted)] hover:bg-[var(--flux-primary-alpha-05)] hover:text-[var(--flux-text)]"
                    }`
                  : `rounded-lg border px-3 py-2 ${
                      active
                        ? "border-[var(--flux-primary-alpha-25)] bg-[linear-gradient(135deg,var(--flux-primary-alpha-20),var(--flux-primary-alpha-10))] text-[var(--flux-primary-light)] shadow-[0_6px_20px_var(--flux-primary-alpha-12)]"
                        : "border-transparent text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-12)] hover:bg-[var(--flux-primary-alpha-08)] hover:text-[var(--flux-text)]"
                    }`
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
      <div
        className={`mt-4 border-t pt-3 ${isMinimal ? "border-[var(--flux-chrome-alpha-10)]" : "border-[var(--flux-primary-alpha-10)]"}`}
        role="group"
        aria-label={t("variant.toggleTooltip")}
      >
        <div
          className={`flex rounded-[var(--flux-rad-sm)] border p-0.5 ${
            isMinimal ? "border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-black-alpha-04)]" : "border-[var(--flux-primary-alpha-12)] bg-[var(--flux-black-alpha-04)]"
          }`}
        >
          <button
            type="button"
            onClick={() => navActions?.setVariant("aurora")}
            className={`flex-1 rounded-[calc(var(--flux-rad-sm)-2px)] px-2 py-1.5 text-[11px] font-semibold transition-all ${
              navVariant === "aurora"
                ? "bg-[var(--flux-primary-alpha-18)] text-[var(--flux-primary-light)]"
                : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
            }`}
          >
            {t("variant.aurora")}
          </button>
          <button
            type="button"
            onClick={() => navActions?.setVariant("minimal")}
            className={`flex-1 rounded-[calc(var(--flux-rad-sm)-2px)] px-2 py-1.5 text-[11px] font-semibold transition-all ${
              navVariant === "minimal"
                ? "bg-[var(--flux-primary-alpha-18)] text-[var(--flux-primary-light)]"
                : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
            }`}
          >
            {t("variant.minimal")}
          </button>
        </div>
      </div>
    </aside>
  );
}
