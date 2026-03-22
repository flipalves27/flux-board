"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLocale } from "next-intl";

import { useAuth } from "@/context/auth-context";
import { Header } from "@/components/header";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { useToast } from "@/context/toast-context";
import { DOWNGRADE_GRACE_DAYS, getProMaxUsers } from "@/lib/billing-limits";
import { formatBrl, PRICING_BRL } from "@/lib/billing-pricing";
import { PRO_FEATURE_LABELS_PT } from "@/lib/plan-gates";

type Plan = "free" | "trial" | "pro" | "business" | "enterprise";

const MATRIX: { label: string; free: string; pro: string; business: string; enterprise: string }[] = [
  { label: "Boards", free: "3", pro: "Ilimitado", business: "Ilimitado", enterprise: "Ilimitado" },
  { label: "Usuários", free: "1", pro: "Até 10 (seats)", business: "Até 100", enterprise: "Ilimitado" },
  { label: "IA (calls/dia)", free: "3", pro: "50", business: "Ilimitado", enterprise: "Ilimitado" },
  { label: "Daily IA, Card Context, Brief", free: "—", pro: "Incluso", business: "Incluso", enterprise: "Incluso" },
  { label: "Portfolio, OKRs, Copilot", free: "—", pro: "Incluso", business: "Incluso", enterprise: "Incluso" },
  { label: "White-label / branding", free: "—", pro: "Logo", business: "Completo", enterprise: "Completo + domínio" },
  { label: "SSO / SLA", free: "—", pro: "—", business: "—", enterprise: "Incluso" },
];

export default function BillingPage() {
  const router = useRouter();
  const locale = useLocale();
  const localeRoot = `/${locale}`;

  const { user, getHeaders, isChecked } = useAuth();
  const { pushToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [plan, setPlan] = useState<Plan>("free");
  const [maxUsers, setMaxUsers] = useState<number | null>(null);
  const [maxBoards, setMaxBoards] = useState<number | null>(null);
  const [stripeStatus, setStripeStatus] = useState<string | null>(null);
  const [periodEnd, setPeriodEnd] = useState<string | null>(null);
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [downgradeGraceEndsAt, setDowngradeGraceEndsAt] = useState<string | null>(null);

  const [membersCount, setMembersCount] = useState<number>(1);
  const [seats, setSeats] = useState<number>(1);

  const [impact, setImpact] = useState<{
    lostFeatures: string[];
    boardsOver: number;
    usersOver: number;
    freeMaxBoards: number;
    freeMaxUsers: number;
  } | null>(null);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("too_expensive");
  const [cancelDetail, setCancelDetail] = useState("");
  const [billingInterval, setBillingInterval] = useState<"month" | "year">("month");
  /** false quando já existe assinatura Stripe ativa — trocar plano via Portal, não novo checkout. */
  const [allowStripeCheckout, setAllowStripeCheckout] = useState(true);

  const isAdmin = Boolean(user?.isAdmin);
  const isProOrBusiness = plan === "pro" || plan === "business" || plan === "enterprise";
  const proCap = getProMaxUsers();

  const planBadge = useMemo(() => {
    if (plan === "free") return "Free";
    if (plan === "trial") return "Trial Pro";
    if (plan === "pro") return "Pro";
    if (plan === "business") return "Business";
    if (plan === "enterprise") return "Enterprise";
    return "Business";
  }, [plan]);

  useEffect(() => {
    if (!isChecked || !user) return;
    if (!user.isAdmin) router.replace(`${localeRoot}/boards`);
  }, [isChecked, user, router, localeRoot]);

  useEffect(() => {
    if (!isChecked || !user) return;
    if (!isAdmin) return;

    setLoading(true);
    setError(null);
    (async () => {
      try {
        const orgData = await apiGet<{ organization: Record<string, unknown> }>("/api/organizations/me", getHeaders());
        const org = orgData?.organization;
        const rawPlan = String(org?.plan ?? "free");
        const nextPlan: Plan =
          rawPlan === "pro" ||
          rawPlan === "business" ||
          rawPlan === "enterprise" ||
          rawPlan === "trial" ||
          rawPlan === "free"
            ? (rawPlan as Plan)
            : "free";
        setPlan(nextPlan);
        setMaxUsers(typeof org?.maxUsers === "number" ? org.maxUsers : null);
        setMaxBoards(typeof org?.maxBoards === "number" ? org.maxBoards : null);
        setStripeStatus(org?.stripeStatus != null ? String(org.stripeStatus) : null);
        setPeriodEnd(org?.stripeCurrentPeriodEnd != null ? String(org.stripeCurrentPeriodEnd) : null);
        setTrialEndsAt(org?.trialEndsAt != null ? String(org.trialEndsAt) : null);
        setDowngradeGraceEndsAt(org?.downgradeGraceEndsAt != null ? String(org.downgradeGraceEndsAt) : null);

        setAllowStripeCheckout(
          typeof (org as { allowStripeCheckout?: unknown }).allowStripeCheckout === "boolean"
            ? (org as { allowStripeCheckout: boolean }).allowStripeCheckout
            : true
        );

        const usersData = await apiGet<{ users: unknown[] }>("/api/users", getHeaders());
        const count = Array.isArray(usersData?.users) ? usersData.users.length : 1;
        setMembersCount(Math.max(1, count));
        setSeats((prev) => {
          if (prev <= 1) return Math.max(1, count);
          return prev;
        });

        if (nextPlan === "pro" || nextPlan === "business" || nextPlan === "enterprise") {
          const imp = await apiGet<{
            impact: {
              lostFeatures: string[];
              boardsOver: number;
              usersOver: number;
              freeMaxBoards: number;
              freeMaxUsers: number;
            };
          }>("/api/billing/downgrade-impact", getHeaders());
          setImpact(imp?.impact ?? null);
        } else {
          setImpact(null);
        }
      } catch (e) {
        if (e instanceof ApiError) {
          if (e.status === 401) router.replace(`${localeRoot}/login`);
          else if (e.status === 403) router.replace(`${localeRoot}/boards`);
          else setError(e.data && typeof (e.data as { error?: string }).error === "string" ? (e.data as { error: string }).error : e.message);
        } else {
          setError(e instanceof Error ? e.message : "Erro ao carregar billing.");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [isChecked, user, isAdmin, getHeaders, router, localeRoot]);

  async function startCheckout(nextPlan: "pro" | "business") {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const seatsToSend =
        nextPlan === "pro" ? Math.min(Math.max(1, seats), proCap) : Math.max(1, seats);

      const res = await apiPost<{ url: string }>("/api/billing/checkout", {
        plan: nextPlan,
        seats: seatsToSend,
        interval: billingInterval === "year" ? "year" : "month",
      }, getHeaders());
      if (!res?.url) throw new Error("Stripe não retornou URL.");
      window.location.href = res.url;
    } catch (e) {
      if (e instanceof ApiError) {
        const msg = (e.data as { error?: string })?.error ?? e.message;
        pushToast({
          kind: "error",
          title: e.status === 409 ? "Use o Portal Stripe" : "Falha no checkout",
          description: msg,
        });
        if (e.status === 409) setAllowStripeCheckout(false);
      } else {
        pushToast({ kind: "error", title: "Falha no checkout", description: e instanceof Error ? e.message : "Erro interno" });
      }
    } finally {
      setBusy(false);
    }
  }

  async function openPortal() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiPost<{ url: string }>("/api/billing/portal", {}, getHeaders());
      if (!res?.url) throw new Error("Stripe não retornou URL do portal.");
      window.location.href = res.url;
    } catch (e) {
      if (e instanceof ApiError) {
        pushToast({ kind: "error", title: "Falha no portal", description: (e.data as { error?: string })?.error ?? e.message });
      } else {
        pushToast({ kind: "error", title: "Falha no portal", description: e instanceof Error ? e.message : "Erro interno" });
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitCancellationFeedback() {
    if (!user) return;
    setBusy(true);
    try {
      await apiPost(
        "/api/billing/cancellation-feedback",
        { code: cancelReason, reason: cancelDetail },
        getHeaders()
      );
      pushToast({ kind: "success", title: "Obrigado pelo feedback." });
      setCancelOpen(false);
    } catch (e) {
      pushToast({
        kind: "error",
        title: "Erro",
        description: e instanceof ApiError ? (e.data as { error?: string })?.error ?? e.message : "Falha ao enviar",
      });
    } finally {
      setBusy(false);
    }
  }

  async function pauseBilling() {
    if (!user) return;
    setBusy(true);
    try {
      await apiPost("/api/billing/pause", {}, getHeaders());
      pushToast({ kind: "success", title: "Cobrança pausada por 30 dias (Stripe)." });
      setCancelOpen(false);
    } catch (e) {
      pushToast({
        kind: "error",
        title: "Não foi possível pausar",
        description: e instanceof ApiError ? (e.data as { error?: string })?.error ?? e.message : "Erro",
      });
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[var(--flux-surface-dark)]">
      <Header title="Billing" backHref={`${localeRoot}/boards`} backLabel="← Boards">
        <span className="text-xs text-[var(--flux-text-muted)]">{planBadge}</span>
      </Header>
      <main className="max-w-[1100px] mx-auto px-6 py-10 space-y-10">
        {loading ? (
          <p className="text-[var(--flux-text-muted)]">Carregando...</p>
        ) : (
          <>
            {error && (
              <div className="bg-[var(--flux-danger-alpha-12)] border border-[var(--flux-danger-alpha-30)] text-[var(--flux-danger)] p-3 rounded-[var(--flux-rad)] text-sm">
                {error}
              </div>
            )}

            <section className="rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] p-6 shadow-[var(--flux-shadow-elevated-card)]">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="font-display font-bold text-2xl text-[var(--flux-text)]">Planos e cobrança</h2>
                  <p className="mt-1 text-sm text-[var(--flux-text-muted)]">
                    Status Stripe: <span className="font-mono">{stripeStatus ?? "—"}</span>
                    {periodEnd ? (
                      <>
                        {" "}
                        · Período até: <span className="font-mono">{periodEnd}</span>
                      </>
                    ) : null}
                  </p>
                  {plan === "trial" && trialEndsAt ? (
                    <p className="mt-2 text-sm text-[var(--flux-primary-light)]">
                      Trial ativo até {new Date(trialEndsAt).toLocaleString(locale === "en" ? "en-US" : "pt-BR")}.
                    </p>
                  ) : null}
                  {downgradeGraceEndsAt ? (
                    <p className="mt-2 text-xs text-[var(--flux-text-muted)]">
                      Carência pós-downgrade até: {new Date(downgradeGraceEndsAt).toLocaleString(locale === "en" ? "en-US" : "pt-BR")}{" "}
                      ({DOWNGRADE_GRACE_DAYS} dias para exportar dados).
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-[var(--flux-text-muted)]">
                    Limites atuais:{" "}
                    <span className="font-mono">
                      boards={maxBoards ?? "—"}; usuários={maxUsers ?? "—"}
                    </span>
                  </p>
                  {isProOrBusiness && !allowStripeCheckout ? (
                    <div className="mt-4 rounded-[var(--flux-rad)] border border-[var(--flux-info-alpha-35)] bg-[var(--flux-info-alpha-08)] px-4 py-3 text-sm text-[var(--flux-text)]">
                      <p className="font-semibold text-[var(--flux-text)]">Como admin, altere o plano pelo Stripe</p>
                      <p className="mt-1 text-[var(--flux-text-muted)]">
                        Com cobrança ativa, use o <strong>Portal do cliente</strong> para trocar entre Pro e Business, mudar a
                        quantidade de seats, alternar mensal/anual ou atualizar o cartão — evitando uma segunda assinatura.
                      </p>
                      <button type="button" disabled={busy} className="btn-primary mt-3" onClick={() => void openPortal()}>
                        {busy ? "Abrindo..." : "Abrir Portal Stripe (mudar plano)"}
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  {isProOrBusiness ? (
                    <>
                      <button disabled={busy} className="btn-primary" onClick={openPortal}>
                        {busy ? "Abrindo..." : "Gerenciar assinatura (Portal Stripe)"}
                      </button>
                      <button disabled={busy} type="button" className="btn-secondary" onClick={() => setCancelOpen(true)}>
                        Cancelar / pausar
                      </button>
                    </>
                  ) : (
                    <button disabled={busy} className="btn-secondary" onClick={() => router.replace(`${localeRoot}/org-settings`)}>
                      Configuração da organização
                    </button>
                  )}
                </div>
              </div>

              <p className="mt-4 text-xs text-[var(--flux-text-muted)]">
                Faturas e PDFs:{" "}
                <Link href={`${localeRoot}/org-settings`} className="text-[var(--flux-primary-light)] underline-offset-2 hover:underline">
                  Configuração da organização
                </Link>
                .
              </p>
            </section>

            <section className="rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] p-6 shadow-[var(--flux-shadow-elevated-card)] overflow-x-auto">
              <h3 className="font-display font-bold text-lg text-[var(--flux-text)] mb-4">Comparativo</h3>
              <table className="w-full min-w-[880px] text-sm border-collapse">
                <thead>
                  <tr className="border-b border-[var(--flux-chrome-alpha-12)]">
                    <th className="text-left py-2 pr-2 text-[var(--flux-text-muted)] font-semibold">Recurso</th>
                    <th className="text-left py-2 px-2 text-[var(--flux-text)] font-semibold">Free</th>
                    <th className="text-left py-2 px-2 text-[var(--flux-primary-light)] font-semibold">Pro</th>
                    <th className="text-left py-2 px-2 text-[var(--flux-secondary)] font-semibold">Business</th>
                    <th className="text-left py-2 px-2 text-[var(--flux-text)] font-semibold">Enterprise</th>
                  </tr>
                </thead>
                <tbody>
                  {MATRIX.map((row) => (
                    <tr key={row.label} className="border-b border-[var(--flux-primary-alpha-08)]">
                      <td className="py-2 pr-2 text-[var(--flux-text)]">{row.label}</td>
                      <td className="py-2 px-2 text-[var(--flux-text-muted)]">{row.free}</td>
                      <td className="py-2 px-2 text-[var(--flux-text-muted)]">{row.pro}</td>
                      <td className="py-2 px-2 text-[var(--flux-text-muted)]">{row.business}</td>
                      <td className="py-2 px-2 text-[var(--flux-text-muted)]">{row.enterprise}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] p-6 shadow-[var(--flux-shadow-elevated-card)]">
              <h3 className="font-display font-bold text-lg text-[var(--flux-text)] mb-2">Assinar ou fazer upgrade</h3>
              {!allowStripeCheckout ? (
                <p className="mb-4 text-sm text-[var(--flux-text-muted)]">
                  Checkout abaixo fica disponível quando não há assinatura Stripe ativa (ex.: primeiro upgrade ou após
                  cancelamento). Com assinatura ativa, use o botão <strong>Portal Stripe</strong> acima para mudar de
                  plano.
                </p>
              ) : (
                <p className="mb-4 text-sm text-[var(--flux-text-muted)]">
                  Primeira assinatura ou reativação: escolha o plano e conclua no Stripe.
                </p>
              )}
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <span className="text-xs font-semibold text-[var(--flux-text-muted)]">Cobrança</span>
                <div className="inline-flex rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] p-0.5 bg-[var(--flux-surface-elevated)]">
                  <button
                    type="button"
                    className={`px-3 py-1.5 text-xs rounded-[calc(var(--flux-rad)-2px)] ${
                      billingInterval === "month" ? "bg-[var(--flux-primary-alpha-20)] text-[var(--flux-text)]" : "text-[var(--flux-text-muted)]"
                    }`}
                    onClick={() => setBillingInterval("month")}
                  >
                    Mensal
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1.5 text-xs rounded-[calc(var(--flux-rad)-2px)] ${
                      billingInterval === "year" ? "bg-[var(--flux-primary-alpha-20)] text-[var(--flux-text)]" : "text-[var(--flux-text-muted)]"
                    }`}
                    onClick={() => setBillingInterval("year")}
                  >
                    Anual (−20%)
                  </button>
                </div>
                <span className="text-[11px] text-[var(--flux-text-muted)]">Cupons de desconto podem ser aplicados no checkout Stripe.</span>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div
                  className={`rounded-[var(--flux-rad)] border p-5 ${plan === "free" ? "border-[var(--flux-gold-alpha-35)] bg-[var(--flux-gold-alpha-08)]" : "border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]"}`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">Free</p>
                  <p className="mt-2 font-display text-2xl font-bold text-[var(--flux-text)]">R$ 0</p>
                  <div className="mt-3 space-y-1 text-xs text-[var(--flux-text-muted)]">
                    <p>Kanban, export CSV básico</p>
                  </div>
                  <div className="mt-5">
                    <button disabled className="btn-secondary w-full">
                      Plano atual
                    </button>
                  </div>
                </div>

                <div
                  className={`rounded-[var(--flux-rad)] border p-5 ${plan === "pro" ? "border-[var(--flux-primary-alpha-55)] bg-[var(--flux-primary-alpha-10)]" : "border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]"}`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">Pro</p>
                  <p className="mt-2 font-display text-2xl font-bold text-[var(--flux-text)]">
                    {billingInterval === "year"
                      ? `${formatBrl(PRICING_BRL.proSeatYear)}/seat/mês`
                      : `${formatBrl(PRICING_BRL.proSeatMonth)}/seat/mês`}
                  </p>
                  {billingInterval === "year" ? (
                    <p className="text-[11px] text-[var(--flux-text-muted)]">Cobrança anual (equivalente a {formatBrl(PRICING_BRL.proSeatYear)}/mês).</p>
                  ) : null}
                  <ul className="mt-3 text-xs text-[var(--flux-text-muted)] space-y-1 list-disc pl-4">
                    {PRO_FEATURE_LABELS_PT.slice(0, 5).map((x) => (
                      <li key={x.key}>{x.label}</li>
                    ))}
                  </ul>
                  <div className="mt-4">
                    <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">Seats (até {proCap})</label>
                    <input
                      type="number"
                      min={1}
                      max={proCap}
                      value={seats}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setSeats(Number.isFinite(v) ? Math.max(1, v) : 1);
                      }}
                      className="w-full px-3 py-2 border border-[var(--flux-chrome-alpha-12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                      disabled={busy || plan === "pro" || !allowStripeCheckout}
                    />
                  </div>
                  <div className="mt-5">
                    {plan === "pro" ? (
                      <button disabled className="btn-secondary w-full">
                        Pro ativo
                      </button>
                    ) : (
                      <button
                        disabled={busy || seats < 1 || !allowStripeCheckout}
                        className="btn-primary w-full"
                        onClick={() => startCheckout("pro")}
                        title={!allowStripeCheckout ? "Use o Portal Stripe para mudar de plano" : undefined}
                      >
                        {busy ? "Indo para Stripe..." : !allowStripeCheckout ? "Use o Portal (assinatura ativa)" : "Upgrade Pro"}
                      </button>
                    )}
                  </div>
                </div>

                <div
                  className={`rounded-[var(--flux-rad)] border p-5 ${plan === "business" ? "border-[var(--flux-secondary-alpha-55)] bg-[var(--flux-secondary-alpha-10)]" : "border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]"}`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">Business</p>
                  <p className="mt-2 font-display text-2xl font-bold text-[var(--flux-text)]">
                    {billingInterval === "year"
                      ? `${formatBrl(PRICING_BRL.businessSeatYear)}/seat/mês`
                      : `${formatBrl(PRICING_BRL.businessSeatMonth)}/seat/mês`}
                  </p>
                  {billingInterval === "year" ? (
                    <p className="text-[11px] text-[var(--flux-text-muted)]">Cobrança anual (equivalente a {formatBrl(PRICING_BRL.businessSeatYear)}/mês).</p>
                  ) : null}
                  <ul className="mt-3 text-xs text-[var(--flux-text-muted)] space-y-1 list-disc pl-4">
                    <li>Tudo do Pro</li>
                    <li>Domínio customizado</li>
                    <li>Webhooks, escala</li>
                  </ul>
                  <div className="mt-4">
                    <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">Seats</label>
                    <input
                      type="number"
                      min={1}
                      value={seats}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setSeats(Number.isFinite(v) ? Math.max(1, v) : 1);
                      }}
                      className="w-full px-3 py-2 border border-[var(--flux-chrome-alpha-12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                      disabled={busy || plan === "business" || !allowStripeCheckout}
                    />
                  </div>
                  <div className="mt-5">
                    {plan === "business" ? (
                      <button disabled className="btn-secondary w-full">
                        Business ativo
                      </button>
                    ) : (
                      <button
                        disabled={busy || seats < 1 || !allowStripeCheckout}
                        className="btn-primary w-full"
                        onClick={() => startCheckout("business")}
                        title={!allowStripeCheckout ? "Use o Portal Stripe para mudar de plano" : undefined}
                      >
                        {busy ? "Indo para Stripe..." : !allowStripeCheckout ? "Use o Portal (assinatura ativa)" : "Upgrade Business"}
                      </button>
                    )}
                  </div>
                </div>

                <div
                  className={`rounded-[var(--flux-rad)] border p-5 ${plan === "enterprise" ? "border-[var(--flux-gold-alpha-35)] bg-[var(--flux-gold-alpha-08)]" : "border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]"}`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">Enterprise</p>
                  <p className="mt-2 font-display text-2xl font-bold text-[var(--flux-text)]">Sob consulta</p>
                  <ul className="mt-3 text-xs text-[var(--flux-text-muted)] space-y-1 list-disc pl-4">
                    <li>SSO (SAML/OIDC), SLA dedicado</li>
                    <li>Copilot com tools custom, domínio próprio</li>
                    <li>Contrato e faturamento invoice (Stripe Invoicing)</li>
                  </ul>
                  <div className="mt-5">
                    {plan === "enterprise" ? (
                      <button disabled className="btn-secondary w-full">
                        Enterprise ativo
                      </button>
                    ) : (
                      <a
                        href={`mailto:${process.env.NEXT_PUBLIC_SALES_EMAIL ?? "vendas@fluxboard.app"}?subject=${encodeURIComponent("Flux-Board Enterprise")}`}
                        className="btn-secondary w-full inline-flex justify-center items-center"
                      >
                        Fale com vendas
                      </a>
                    )}
                  </div>
                </div>
              </div>
              {(plan === "trial" || plan === "free") && (
                <p className="mt-4 text-xs text-[var(--flux-text-muted)]">
                  Trial de 14 dias inclui recursos Pro. Após o trial, o espaço volta ao Free até você assinar.
                </p>
              )}
            </section>

            {isProOrBusiness && impact ? (
              <section className="rounded-[var(--flux-rad-xl)] border border-[var(--flux-secondary-alpha-25)] bg-[var(--flux-surface-card)] p-6 shadow-[var(--flux-shadow-elevated-card)]">
                <h3 className="font-display font-bold text-lg text-[var(--flux-text)] mb-2">Downgrade para Free</h3>
                <p className="text-sm text-[var(--flux-text-muted)] mb-4">
                  Ao cancelar a assinatura no Stripe, você terá <strong>{DOWNGRADE_GRACE_DAYS} dias</strong> com os mesmos limites para exportar dados antes de aplicarmos os tetos do Free.
                </p>
                <p className="text-sm font-semibold text-[var(--flux-text)] mb-2">Recursos que deixam de estar disponíveis no Free:</p>
                <ul className="list-disc pl-5 text-sm text-[var(--flux-text-muted)] space-y-1">
                  {impact.lostFeatures.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
                {(impact.boardsOver > 0 || impact.usersOver > 0) && (
                  <div className="mt-4 text-sm text-[var(--flux-danger)]">
                    <p className="font-semibold">Dados acima do limite Free:</p>
                    {impact.boardsOver > 0 ? (
                      <p>
                        Boards: {impact.boardsOver} acima do limite ({impact.freeMaxBoards}).
                      </p>
                    ) : null}
                    {impact.usersOver > 0 ? (
                      <p>
                        Usuários: {impact.usersOver} acima do limite ({impact.freeMaxUsers}).
                      </p>
                    ) : null}
                  </div>
                )}
              </section>
            ) : null}
          </>
        )}
      </main>

      {cancelOpen ? (
        <div className="fixed inset-0 z-[var(--flux-z-modal-critical)] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="max-w-md w-full rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] p-6 shadow-[var(--flux-shadow-elevated-card)]">
            <h4 className="font-display font-bold text-lg text-[var(--flux-text)]">Antes de cancelar</h4>
            <p className="mt-2 text-sm text-[var(--flux-text-muted)]">
              Nos diga o motivo (opcional). Você também pode pausar a cobrança por 30 dias mantendo os dados no Stripe.
            </p>
            <label className="mt-4 block text-xs font-semibold text-[var(--flux-text-muted)]">Motivo</label>
            <select
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] text-sm text-[var(--flux-text)]"
            >
              <option value="too_expensive">Preço alto</option>
              <option value="missing_features">Faltam recursos</option>
              <option value="switching_tool">Vou usar outra ferramenta</option>
              <option value="not_using">Não estou usando</option>
              <option value="other">Outro</option>
            </select>
            <textarea
              value={cancelDetail}
              onChange={(e) => setCancelDetail(e.target.value)}
              placeholder="Detalhes (opcional)"
              rows={3}
              className="mt-3 w-full px-3 py-2 rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] text-sm text-[var(--flux-text)]"
            />
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => setCancelOpen(false)}>
                Fechar
              </button>
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => void pauseBilling()}>
                Pausar cobrança 30 dias
              </button>
              <button type="button" className="btn-primary" disabled={busy} onClick={() => void submitCancellationFeedback()}>
                Enviar feedback
              </button>
            </div>
            <p className="mt-3 text-xs text-[var(--flux-text-muted)]">
              Para cancelar de fato, use &quot;Gerenciar assinatura&quot; (Portal Stripe).
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
