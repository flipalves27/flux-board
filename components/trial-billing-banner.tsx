"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { useOrgBranding } from "@/context/org-branding-context";
import { apiPut } from "@/lib/api-client";
import { PRO_FEATURE_LABELS_PT } from "@/lib/plan-gates";
import { DOWNGRADE_GRACE_DAYS } from "@/lib/billing-limits";

function msUntil(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, t - Date.now());
}

export function TrialBillingBanner() {
  const { user, getHeaders } = useAuth();
  const ctx = useOrgBranding();
  const org = ctx?.org;
  const locale = useLocale();
  const localeRoot = `/${locale}`;
  const [tick, setTick] = useState(0);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const trialRemain = useMemo(() => {
    if (!org || org.plan !== "trial" || !org.trialEndsAt) return null;
    return msUntil(org.trialEndsAt);
  }, [org, tick]);

  const graceRemain = useMemo(() => {
    if (!org || org.plan !== "free" || !org.downgradeGraceEndsAt) return null;
    return msUntil(org.downgradeGraceEndsAt);
  }, [org, tick]);

  const dismissNotice = useCallback(async () => {
    if (!user?.isAdmin) return;
    setDismissing(true);
    try {
      await apiPut<{ organization: unknown }>(
        "/api/organizations/me",
        { dismissBillingNotice: true },
        getHeaders()
      );
      await ctx?.refresh();
    } catch (e) {
      console.error(e);
    } finally {
      setDismissing(false);
    }
  }, [user?.isAdmin, getHeaders, ctx]);

  if (!user || !org) return null;

  if (org.plan === "trial" && org.trialEndsAt && trialRemain !== null && trialRemain > 0) {
    const d = Math.floor(trialRemain / (24 * 60 * 60 * 1000));
    const h = Math.floor((trialRemain % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    return (
      <div className="shrink-0 border-b border-[var(--flux-primary-alpha-25)] bg-[var(--flux-primary-alpha-10)] px-4 py-2 text-center text-sm text-[var(--flux-text)]">
        <span className="font-semibold">Trial Pro</span>
        {" · "}
        <span className="text-[var(--flux-text-muted)]">
          restam {d}d {h}h
        </span>
        {user.isAdmin ? (
          <>
            {" · "}
            <Link href={`${localeRoot}/billing`} className="font-semibold text-[var(--flux-primary-light)] underline-offset-2 hover:underline">
              Fazer upgrade
            </Link>
          </>
        ) : null}
      </div>
    );
  }

  if (org.billingNotice?.kind === "trial_ended") {
    return (
      <div className="shrink-0 border-b border-[var(--flux-gold-alpha-35)] bg-[var(--flux-gold-alpha-08)] px-4 py-3 text-sm text-[var(--flux-text)]">
        <p className="font-semibold">Seu trial de 14 dias terminou. O espaço passou para o plano Free.</p>
        <p className="mt-1 text-xs text-[var(--flux-text-muted)]">
          Recursos Pro desativados: {PRO_FEATURE_LABELS_PT.map((x) => x.label).join(", ")}.
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          {user.isAdmin ? (
            <>
              <Link href={`${localeRoot}/billing`} className="btn-primary text-xs py-1.5 px-3">
                Ver planos
              </Link>
              <button
                type="button"
                disabled={dismissing}
                className="text-xs text-[var(--flux-text-muted)] underline-offset-2 hover:underline"
                onClick={() => void dismissNotice()}
              >
                {dismissing ? "…" : "Entendi, ocultar"}
              </button>
            </>
          ) : (
            <span className="text-xs text-[var(--flux-text-muted)]">Peça ao admin para fazer upgrade.</span>
          )}
        </div>
      </div>
    );
  }

  if (org.plan === "free" && org.downgradeGraceEndsAt && graceRemain !== null && graceRemain > 0) {
    const days = Math.ceil(graceRemain / (24 * 60 * 60 * 1000));
    return (
      <div className="shrink-0 border-b border-[var(--flux-secondary-alpha-35)] bg-[var(--flux-secondary-alpha-08)] px-4 py-2 text-center text-sm text-[var(--flux-text)]">
        <span className="font-semibold">Período de carência ({DOWNGRADE_GRACE_DAYS} dias)</span>
        {" · "}
        <span className="text-[var(--flux-text-muted)]">
          ~{days} dia(s) para exportar dados antes dos limites Free
        </span>
        {user.isAdmin ? (
          <>
            {" · "}
            <Link href={`${localeRoot}/billing`} className="font-semibold text-[var(--flux-secondary)] underline-offset-2 hover:underline">
              Detalhes
            </Link>
          </>
        ) : null}
      </div>
    );
  }

  if (org.billingNotice?.kind === "downgrade_grace_ended") {
    return (
      <div className="shrink-0 border-b border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-elevated)] px-4 py-2 text-center text-xs text-[var(--flux-text-muted)]">
        Limites do plano Free aplicados.
        {user.isAdmin ? (
          <>
            {" "}
            <button
              type="button"
              disabled={dismissing}
              className="text-[var(--flux-primary-light)] underline-offset-2 hover:underline"
              onClick={() => void dismissNotice()}
            >
              {dismissing ? "…" : "Ocultar"}
            </button>
          </>
        ) : null}
      </div>
    );
  }

  return null;
}
