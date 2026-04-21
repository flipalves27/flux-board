"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";

import { Header } from "@/components/header";
import { useAuth } from "@/context/auth-context";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { useToast } from "@/context/toast-context";
import { getProMaxUsers } from "@/lib/billing-limits";
import { formatBrl, PRICING_BRL } from "@/lib/billing-pricing";
import type { PublicCommercialCatalog } from "@/lib/platform-commercial-settings";
import { isPlatformAdminSession, sessionCanManageOrgBilling } from "@/lib/rbac";

type CheckoutPlan = "pro" | "business";

export default function BillingCheckoutPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const localeRoot = `/${locale}`;
  const isEn = locale === "en";

  const { user, getHeaders, isChecked } = useAuth();
  const { pushToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [orgPlan, setOrgPlan] = useState<string>("free");
  const [allowStripeCheckout, setAllowStripeCheckout] = useState(true);
  const [membersCount, setMembersCount] = useState(1);
  const [seats, setSeats] = useState(1);
  const [billingInterval, setBillingInterval] = useState<"month" | "year">("month");
  const [pendingPlan, setPendingPlan] = useState<CheckoutPlan | null>(null);
  const [commercialCatalog, setCommercialCatalog] = useState<PublicCommercialCatalog>(() => ({
    pricing: { ...PRICING_BRL },
    proEnabled: true,
    businessEnabled: true,
  }));

  const autoStarted = useRef(false);
  const proCap = getProMaxUsers();

  const canBilling = Boolean(user && sessionCanManageOrgBilling(user));
  const isPlatformOperator = Boolean(user && isPlatformAdminSession(user));

  const planFromUrl = searchParams.get("plan");
  const intervalFromUrl = searchParams.get("interval");
  const seatsFromUrl = searchParams.get("seats");

  const redirectToStripe = useCallback(
    async (plan: CheckoutPlan) => {
      if (!user) return;
      setPendingPlan(plan);
      setBusy(true);
      setError(null);
      try {
        const seatsToSend =
          plan === "pro" ? Math.min(Math.max(1, seats), proCap) : Math.max(1, seats);
        const res = await apiPost<{ url: string }>(
          "/api/billing/checkout",
          {
            plan,
            seats: seatsToSend,
            interval: billingInterval === "year" ? "year" : "month",
            locale,
          },
          getHeaders()
        );
        if (!res?.url) throw new Error(isEn ? "Stripe did not return a URL." : "Stripe não retornou URL.");
        window.location.href = res.url;
      } catch (e) {
        if (e instanceof ApiError) {
          const msg = (e.data as { error?: string })?.error ?? e.message;
          pushToast({
            kind: "error",
            title: e.status === 409 ? (isEn ? "Use Stripe Customer Portal" : "Use o Portal Stripe") : isEn ? "Checkout failed" : "Falha no checkout",
            description: msg,
          });
          if (e.status === 409) setAllowStripeCheckout(false);
        } else {
          pushToast({
            kind: "error",
            title: isEn ? "Checkout failed" : "Falha no checkout",
            description: e instanceof Error ? e.message : "Erro interno",
          });
        }
      } finally {
        setBusy(false);
        setPendingPlan(null);
      }
    },
    [user, seats, proCap, billingInterval, locale, getHeaders, pushToast, isEn]
  );

  useEffect(() => {
    if (!isChecked || !user) return;
    if (!sessionCanManageOrgBilling(user)) router.replace(`${localeRoot}/boards`);
  }, [isChecked, user, router, localeRoot]);

  useEffect(() => {
    if (intervalFromUrl === "year" || intervalFromUrl === "annual") setBillingInterval("year");
    else if (intervalFromUrl === "month") setBillingInterval("month");
  }, [intervalFromUrl]);

  useEffect(() => {
    const raw = seatsFromUrl ? Number(seatsFromUrl) : NaN;
    if (Number.isFinite(raw) && raw >= 1) setSeats(Math.floor(raw));
  }, [seatsFromUrl]);

  useEffect(() => {
    if (!isChecked || !user) return;
    if (!canBilling) return;

    setLoading(true);
    setError(null);
    (async () => {
      try {
        const catalogPromise = apiGet<PublicCommercialCatalog>("/api/platform/commercial-catalog", getHeaders()).catch(
          () => null as PublicCommercialCatalog | null
        );
        const [orgData, usersData, cat] = await Promise.all([
          apiGet<{ organization: Record<string, unknown> }>("/api/organizations/me", getHeaders()),
          apiGet<{ users: unknown[] }>("/api/users", getHeaders()),
          catalogPromise,
        ]);

        const org = orgData?.organization;
        setOrgPlan(String(org?.plan ?? "free"));
        setAllowStripeCheckout(
          typeof (org as { allowStripeCheckout?: unknown }).allowStripeCheckout === "boolean"
            ? (org as { allowStripeCheckout: boolean }).allowStripeCheckout
            : true
        );

        if (cat?.pricing) {
          setCommercialCatalog({
            pricing: cat.pricing,
            proEnabled: cat.proEnabled !== false,
            businessEnabled: cat.businessEnabled !== false,
          });
        }

        const count = Array.isArray(usersData?.users) ? usersData.users.length : 1;
        setMembersCount(Math.max(1, count));
        setSeats((prev) => {
          if (seatsFromUrl && Number.isFinite(Number(seatsFromUrl))) return prev;
          if (prev <= 1) return Math.max(1, count);
          return prev;
        });
      } catch (e) {
        if (e instanceof ApiError) {
          if (e.status === 401) {
            const next = `${pathname}?${searchParams.toString()}`;
            router.replace(`${localeRoot}/login?redirect=${encodeURIComponent(next)}`);
          } else if (e.status === 403) router.replace(`${localeRoot}/boards`);
          else
            setError(
              e.data && typeof (e.data as { error?: string }).error === "string"
                ? (e.data as { error: string }).error
                : e.message
            );
        } else {
          setError(e instanceof Error ? e.message : isEn ? "Failed to load checkout." : "Erro ao carregar checkout.");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [isChecked, user, canBilling, getHeaders, router, localeRoot, pathname, searchParams, seatsFromUrl, isEn]);

  useEffect(() => {
    if (!isChecked || !user || !canBilling) return;
    if (loading || busy) return;
    if (isPlatformOperator) return;
    if (!allowStripeCheckout) return;
    const p = planFromUrl === "pro" || planFromUrl === "business" ? planFromUrl : null;
    if (!p) return;
    if (p === "pro" && !commercialCatalog.proEnabled) return;
    if (p === "business" && !commercialCatalog.businessEnabled) return;
    if (autoStarted.current) return;
    autoStarted.current = true;
    void redirectToStripe(p);
  }, [
    isChecked,
    user,
    canBilling,
    loading,
    busy,
    isPlatformOperator,
    allowStripeCheckout,
    planFromUrl,
    commercialCatalog.proEnabled,
    commercialCatalog.businessEnabled,
    redirectToStripe,
  ]);

  if (!user) return null;

  return (
    <div className="min-h-screen">
      <Header
        title={isEn ? "Stripe checkout" : "Checkout Stripe"}
        backHref={`${localeRoot}/billing`}
        backLabel={isEn ? "← Billing" : "← Billing"}
      />
      <main className="max-w-xl mx-auto px-6 py-10 space-y-6">
        {loading ? (
          <p className="text-[var(--flux-text-muted)] text-sm">{isEn ? "Loading…" : "Carregando…"}</p>
        ) : (
          <>
            {error && (
              <div className="bg-[var(--flux-danger-alpha-12)] border border-[var(--flux-danger-alpha-30)] text-[var(--flux-danger)] p-3 rounded-[var(--flux-rad)] text-sm">
                {error}
              </div>
            )}

            {isPlatformOperator ? (
              <p className="text-sm text-[var(--flux-text-muted)] leading-relaxed">
                {isEn
                  ? "Platform admin: open the Stripe Dashboard or use a customer session to test checkout."
                  : "Administrador da plataforma: use o Stripe Dashboard ou uma sessão de cliente para testar o checkout."}
              </p>
            ) : !allowStripeCheckout ? (
              <div className="rounded-[var(--flux-rad)] border border-[var(--flux-info-alpha-35)] bg-[var(--flux-info-alpha-08)] px-4 py-3 text-sm text-[var(--flux-text)]">
                <p className="font-semibold">{isEn ? "Active subscription" : "Assinatura ativa"}</p>
                <p className="mt-1 text-[var(--flux-text-muted)]">
                  {isEn
                    ? "Use the Stripe Customer Portal from the billing page to change plan or seats."
                    : "Use o Portal do cliente na página de billing para alterar plano ou seats."}
                </p>
                <Link href={`${localeRoot}/billing`} className="btn-primary mt-3 inline-flex">
                  {isEn ? "Open billing" : "Abrir billing"}
                </Link>
              </div>
            ) : (
              <>
                <p className="text-sm text-[var(--flux-text-muted)] leading-relaxed">
                  {isEn
                    ? "You will be redirected to Stripe’s secure hosted checkout. Success and cancel return to this app."
                    : "Você será redirecionado para o checkout seguro hospedado pela Stripe. Sucesso e cancelamento voltam para este app."}
                </p>

                {busy && (planFromUrl === "pro" || planFromUrl === "business" || pendingPlan) ? (
                  <p className="text-sm text-[var(--flux-primary-light)]">
                    {isEn ? "Redirecting to Stripe…" : "Redirecionando para a Stripe…"}
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs font-semibold text-[var(--flux-text-muted)]">{isEn ? "Billing" : "Cobrança"}</span>
                  <div
                    className="inline-flex rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] p-0.5 bg-[var(--flux-surface-elevated)]"
                    role="group"
                    aria-label={isEn ? "Billing interval" : "Intervalo de cobrança"}
                  >
                    <button
                      type="button"
                      aria-pressed={billingInterval === "month"}
                      disabled={busy}
                      className={`px-3 py-1.5 text-xs rounded-[calc(var(--flux-rad)-2px)] ${
                        billingInterval === "month"
                          ? "bg-[var(--flux-primary-alpha-20)] text-[var(--flux-text)]"
                          : "text-[var(--flux-text-muted)]"
                      }`}
                      onClick={() => setBillingInterval("month")}
                    >
                      {isEn ? "Monthly" : "Mensal"}
                    </button>
                    <button
                      type="button"
                      aria-pressed={billingInterval === "year"}
                      disabled={busy}
                      className={`px-3 py-1.5 text-xs rounded-[calc(var(--flux-rad)-2px)] ${
                        billingInterval === "year"
                          ? "bg-[var(--flux-primary-alpha-20)] text-[var(--flux-text)]"
                          : "text-[var(--flux-text-muted)]"
                      }`}
                      onClick={() => setBillingInterval("year")}
                    >
                      {isEn ? "Yearly" : "Anual"}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">
                    {isEn ? "Seats" : "Seats"}
                    <span className="font-normal text-[var(--flux-text-muted)]">
                      {" "}
                      ({isEn ? "Pro max" : "Pro máx."} {proCap})
                    </span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={seats}
                    disabled={busy}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setSeats(Number.isFinite(v) ? Math.max(1, v) : 1);
                    }}
                    className="w-full max-w-[200px] px-3 py-2 border border-[var(--flux-chrome-alpha-12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                  />
                  <p className="mt-1 text-[11px] text-[var(--flux-text-muted)]">
                    {isEn ? `Organization has ${membersCount} member(s).` : `Organização com ${membersCount} membro(s).`}
                  </p>
                </div>

                <div className="space-y-3">
                  {commercialCatalog.proEnabled ? (
                    <button
                      type="button"
                      disabled={busy || seats < 1 || orgPlan === "pro"}
                      className="btn-primary w-full"
                      onClick={() => void redirectToStripe("pro")}
                    >
                      {busy && pendingPlan === "pro"
                        ? isEn
                          ? "Opening Stripe…"
                          : "Abrindo Stripe…"
                        : orgPlan === "pro"
                          ? isEn
                            ? "Pro active"
                            : "Pro ativo"
                          : `${isEn ? "Pay with Stripe — Pro" : "Pagar na Stripe — Pro"} (${billingInterval === "year" ? formatBrl(commercialCatalog.pricing.proSeatYear) : formatBrl(commercialCatalog.pricing.proSeatMonth)}${isEn ? "/seat·mo" : "/seat·mês"})`}
                    </button>
                  ) : null}
                  {commercialCatalog.businessEnabled ? (
                    <button
                      type="button"
                      disabled={busy || seats < 1 || orgPlan === "business"}
                      className="btn-secondary w-full"
                      onClick={() => void redirectToStripe("business")}
                    >
                      {busy && pendingPlan === "business"
                        ? isEn
                          ? "Opening Stripe…"
                          : "Abrindo Stripe…"
                        : orgPlan === "business"
                          ? isEn
                            ? "Business active"
                            : "Business ativo"
                          : `${isEn ? "Pay with Stripe — Business" : "Pagar na Stripe — Business"} (${billingInterval === "year" ? formatBrl(commercialCatalog.pricing.businessSeatYear) : formatBrl(commercialCatalog.pricing.businessSeatMonth)}${isEn ? "/seat·mo" : "/seat·mês"})`}
                    </button>
                  ) : null}
                </div>

                <p className="text-[11px] text-[var(--flux-text-muted)]">
                  {isEn ? "Tip: share " : "Dica: compartilhe "}
                  <code className="text-xs font-mono">
                    {localeRoot}/billing/checkout?plan=pro
                  </code>
                  {isEn ? " to open checkout with a plan preselected." : " para abrir o checkout com plano pré-selecionado."}
                </p>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
