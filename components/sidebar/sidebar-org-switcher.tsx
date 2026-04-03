"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { listMyOrganizationsAction, type MyOrganizationRow } from "@/app/actions/auth";
import type { AuthUser } from "@/context/auth-context";
import type { SidebarLayoutMode } from "./sidebar-nav-context";

type Props = {
  user: AuthUser | null;
  layout: SidebarLayoutMode;
  showExpandedNav: boolean;
  closeMobile: () => void;
  switchOrganization: (orgId: string) => Promise<boolean>;
};

export function SidebarOrgSwitcher({
  user,
  layout,
  showExpandedNav,
  closeMobile,
  switchOrganization,
}: Props) {
  const router = useRouter();
  const t = useTranslations("navigation");
  const [orgs, setOrgs] = useState<MyOrganizationRow[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setOrgs([]);
      return;
    }
    const res = await listMyOrganizationsAction();
    if (res.ok) setOrgs(res.orgs);
    else setOrgs([]);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!user || orgs.length < 2) return null;

  const orgIds = new Set(orgs.map((o) => o.orgId));
  /** Evita `<select value>` sem opção correspondente (React #130 / DOM inválido em alguns casos). */
  if (!orgIds.has(user.orgId)) return null;

  if (layout === "desktop" && !showExpandedNav) return null;

  async function onSelect(nextOrgId: string) {
    if (!user || !nextOrgId || nextOrgId === user.orgId || busy) return;
    setBusy(true);
    try {
      const ok = await switchOrganization(nextOrgId);
      if (ok) {
        closeMobile();
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-1.5 mb-1.5 mt-0.5 shrink-0 px-2">
      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
        {t("activeOrganization")}
      </label>
      <select
        aria-label={t("activeOrganization")}
        value={user.orgId}
        disabled={busy}
        onChange={(e) => void onSelect(e.target.value)}
        className="w-full max-w-full cursor-pointer rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-2 py-1.5 text-xs font-medium text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)] disabled:opacity-60"
      >
        {orgs.map((o) => (
          <option key={o.orgId} value={o.orgId}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}
