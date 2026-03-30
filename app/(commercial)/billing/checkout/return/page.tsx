"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { Header } from "@/components/header";
import { useAuth } from "@/context/auth-context";
import { useOrgBranding } from "@/context/org-branding-context";
import { apiPost } from "@/lib/api-client";

export default function CheckoutReturnPage() {
  const locale = useLocale();
  const localeRoot = `/${locale}`;
  const searchParams = useSearchParams();
  const result = searchParams.get("result");
  const sessionId = searchParams.get("session_id");
  const isEn = locale === "en";
  const { getHeaders, user } = useAuth();
  const orgCtx = useOrgBranding();
  const syncStarted = useRef(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);

  const success = result === "success";
  const cancel = result === "cancel";

  const runCheckoutSync = useCallback(async () => {
    if (!sessionId || !user) return;
    try {
      const data = await apiPost<{ synced?: boolean; pending?: boolean; reason?: string }>(
        "/api/billing/checkout/sync",
        { sessionId },
        getHeaders()
      );
      if (data?.synced) {
        await orgCtx?.refresh();
        return;
      }
      if (data?.pending) {
        setSyncNote(
          isEn
            ? "Stripe is still confirming the subscription. Limits should update within a few moments."
            : "A Stripe ainda está confirmando a assinatura. Os limites devem atualizar em instantes."
        );
        return;
      }
    } catch {
      setSyncNote(
        isEn
          ? "Could not sync billing immediately. If your plan does not update, check Stripe webhooks or refresh the page."
          : "Não foi possível sincronizar o plano agora. Se não atualizar, verifique os webhooks no Stripe ou atualize a página."
      );
    }
  }, [sessionId, user, getHeaders, orgCtx, isEn]);

  useEffect(() => {
    if (!success || !sessionId || !user) return;
    if (syncStarted.current) return;
    syncStarted.current = true;
    void runCheckoutSync();
  }, [success, sessionId, user, runCheckoutSync]);

  return (
    <div className="min-h-screen bg-[var(--flux-surface-dark)]">
      <Header
        title={isEn ? "Payment status" : "Status do pagamento"}
        backHref={`${localeRoot}/billing`}
        backLabel={isEn ? "← Billing" : "← Billing"}
      />
      <main className="max-w-lg mx-auto px-6 py-12 space-y-6">
        {success ? (
          <>
            <h1 className="font-display text-2xl font-bold text-[var(--flux-text)]">
              {isEn ? "Payment completed" : "Pagamento concluído"}
            </h1>
            <p className="text-sm text-[var(--flux-text-muted)] leading-relaxed">
              {isEn
                ? "Thank you. We sync your plan from this page when possible; Stripe webhooks also update your organization in the background."
                : "Obrigado. Sincronizamos seu plano nesta página quando possível; os webhooks da Stripe também atualizam sua organização em segundo plano."}
            </p>
            {syncNote ? (
              <p className="text-xs text-[var(--flux-text-muted)] border border-[var(--flux-primary-alpha-25)] rounded-lg px-3 py-2 bg-[var(--flux-primary-alpha-08)]">
                {syncNote}
              </p>
            ) : null}
          </>
        ) : cancel ? (
          <>
            <h1 className="font-display text-2xl font-bold text-[var(--flux-text)]">
              {isEn ? "Checkout cancelled" : "Checkout cancelado"}
            </h1>
            <p className="text-sm text-[var(--flux-text-muted)] leading-relaxed">
              {isEn
                ? "No charge was made. You can return to billing to choose a plan again."
                : "Nenhuma cobrança foi feita. Volte ao billing para escolher um plano novamente."}
            </p>
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl font-bold text-[var(--flux-text)]">
              {isEn ? "Return to billing" : "Retorne ao billing"}
            </h1>
            <p className="text-sm text-[var(--flux-text-muted)] leading-relaxed">
              {isEn ? "This page is used after Stripe checkout. Open billing to manage your plan." : "Esta página é usada após o checkout da Stripe. Abra o billing para gerenciar seu plano."}
            </p>
          </>
        )}
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href={`${localeRoot}/boards`} className="btn-primary inline-flex items-center justify-center">
            {isEn ? "Boards" : "Boards"}
          </Link>
          <Link href={`${localeRoot}/billing`} className="btn-secondary inline-flex items-center justify-center">
            {isEn ? "Billing" : "Billing"}
          </Link>
        </div>
      </main>
    </div>
  );
}
