"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";

import { Header } from "@/components/header";

export default function CheckoutReturnPage() {
  const locale = useLocale();
  const localeRoot = `/${locale}`;
  const searchParams = useSearchParams();
  const result = searchParams.get("result");
  const isEn = locale === "en";

  const success = result === "success";
  const cancel = result === "cancel";

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
                ? "Thank you. Your subscription is being activated; Pro or Business limits may take a few moments to apply after Stripe confirms the webhook."
                : "Obrigado. Sua assinatura está sendo ativada; os limites Pro ou Business podem levar alguns instantes após a confirmação no Stripe."}
            </p>
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
