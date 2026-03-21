"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";

import { useAuth } from "@/context/auth-context";
import { Header } from "@/components/header";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { useToast } from "@/context/toast-context";

type Plan = "free" | "pro" | "business";

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

  const [membersCount, setMembersCount] = useState<number>(1);
  const [seats, setSeats] = useState<number>(1);

  const isAdmin = Boolean(user?.isAdmin);
  const isProOrBusiness = plan === "pro" || plan === "business";

  const proCap = 10; // espelhando `getProMaxUsers()` (default)

  const planBadge = useMemo(() => {
    if (plan === "free") return "Free";
    if (plan === "pro") return "Pro";
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
        const orgData = await apiGet<{ organization: any }>("/api/organizations/me", getHeaders());
        const org = orgData?.organization;
        const nextPlan: Plan = (org?.plan as Plan) || "free";
        setPlan(nextPlan);
        setMaxUsers(typeof org?.maxUsers === "number" ? org.maxUsers : null);
        setMaxBoards(typeof org?.maxBoards === "number" ? org.maxBoards : null);
        setStripeStatus(org?.stripeStatus ?? null);
        setPeriodEnd(org?.stripeCurrentPeriodEnd ?? null);

        const usersData = await apiGet<{ users: any[] }>("/api/users", getHeaders());
        const count = Array.isArray(usersData?.users) ? usersData.users.length : 1;
        setMembersCount(Math.max(1, count));
        setSeats((prev) => {
          // Se ainda não mexeu, alinha `seats` com membros atuais.
          if (prev <= 1) return Math.max(1, count);
          return prev;
        });
      } catch (e) {
        if (e instanceof ApiError) {
          if (e.status === 401) router.replace(`${localeRoot}/login`);
          else if (e.status === 403) router.replace(`${localeRoot}/boards`);
          else setError(e.data && typeof (e.data as any).error === "string" ? (e.data as any).error : e.message);
        } else {
          setError(e instanceof Error ? e.message : "Erro ao carregar billing.");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [isChecked, user, isAdmin, getHeaders, router, localeRoot]);

  async function startCheckout(nextPlan: Exclude<Plan, "free">) {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      // Para Pro, a quantidade de seats deve respeitar o cap.
      const seatsToSend =
        nextPlan === "pro" ? Math.min(Math.max(1, seats), proCap) : Math.max(1, seats);

      const res = await apiPost<{ url: string }>("/api/billing/checkout", { plan: nextPlan, seats: seatsToSend }, getHeaders());
      if (!res?.url) throw new Error("Stripe não retornou URL.");
      window.location.href = res.url;
    } catch (e) {
      if (e instanceof ApiError) {
        pushToast({ kind: "error", title: "Falha no checkout", description: (e.data as any)?.error ?? e.message });
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
        pushToast({ kind: "error", title: "Falha no portal", description: (e.data as any)?.error ?? e.message });
      } else {
        pushToast({ kind: "error", title: "Falha no portal", description: e instanceof Error ? e.message : "Erro interno" });
      }
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
      <main className="max-w-[980px] mx-auto px-6 py-10">
        {loading ? (
          <p className="text-[var(--flux-text-muted)]">Carregando...</p>
        ) : (
          <>
            {error && (
              <div className="mb-4 bg-[var(--flux-danger-alpha-12)] border border-[var(--flux-danger-alpha-30)] text-[var(--flux-danger)] p-3 rounded-[var(--flux-rad)] text-sm">
                {error}
              </div>
            )}

            <section className="rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] p-6 shadow-[var(--flux-shadow-elevated-card)]">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="font-display font-bold text-2xl text-[var(--flux-text)]">Planos</h2>
                  <p className="mt-1 text-sm text-[var(--flux-text-muted)]">
                    Status Stripe: <span className="font-mono">{stripeStatus ?? "—"}</span>
                    {periodEnd ? (
                      <>
                        {" "}
                        · Período até: <span className="font-mono">{periodEnd}</span>
                      </>
                    ) : null}
                  </p>
                  <p className="mt-2 text-xs text-[var(--flux-text-muted)]">
                    Limites atuais:{" "}
                    <span className="font-mono">
                      boards={maxBoards ?? "—"}; usuários={maxUsers ?? "—"}
                    </span>
                  </p>
                </div>
                <div className="flex gap-2 items-center">
                  {isProOrBusiness ? (
                    <button disabled={busy} className="btn-primary" onClick={openPortal}>
                      {busy ? "Abrindo..." : "Gerenciar assinatura"}
                    </button>
                  ) : (
                    <button disabled={busy} className="btn-secondary" onClick={() => router.replace(`${localeRoot}/org-settings`)}>
                      Configurar organização
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                {/* Free */}
                <div className={`rounded-[var(--flux-rad)] border p-5 ${plan === "free" ? "border-[var(--flux-gold-alpha-35)] bg-[var(--flux-gold-alpha-08)]" : "border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]"}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">Free</p>
                  <p className="mt-2 font-display text-2xl font-bold text-[var(--flux-text)]">R$ 0</p>
                  <div className="mt-3 space-y-1 text-xs text-[var(--flux-text-muted)]">
                    <p>Boards: 3</p>
                    <p>Usuários: 1</p>
                    <p>Calls/dia: 3</p>
                  </div>
                  <div className="mt-4 text-xs text-[var(--flux-text-muted)] space-y-1">
                    <p>Kanban core, filtros, CSV export</p>
                  </div>
                  <div className="mt-5">
                    <button disabled className="btn-secondary w-full">
                      Plano atual
                    </button>
                  </div>
                </div>

                {/* Pro */}
                <div className={`rounded-[var(--flux-rad)] border p-5 ${plan === "pro" ? "border-[var(--flux-primary-alpha-55)] bg-[var(--flux-primary-alpha-10)]" : "border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]"}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">Pro</p>
                  <p className="mt-2 font-display text-2xl font-bold text-[var(--flux-text)]">R$/usuário/mês</p>
                  <div className="mt-3 space-y-1 text-xs text-[var(--flux-text-muted)]">
                    <p>Boards: ∞</p>
                    <p>Usuários: 10</p>
                    <p>Calls/dia: ∞</p>
                  </div>
                  <ul className="mt-4 text-xs text-[var(--flux-text-muted)] space-y-1 list-disc pl-4">
                    <li>Daily IA</li>
                    <li>Card Context</li>
                    <li>Executive Brief</li>
                    <li>Routine · 45 tasks sync</li>
                    <li>Portfolio</li>
                  </ul>
                  <div className="mt-4">
                    <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">
                      Seats (até {proCap})
                    </label>
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
                      disabled={busy || plan === "pro"}
                    />
                  </div>
                  <div className="mt-5">
                    {plan === "pro" ? (
                      <button disabled className="btn-secondary w-full">
                        Pro ativo
                      </button>
                    ) : (
                      <button disabled={busy || seats < 1} className="btn-primary w-full" onClick={() => startCheckout("pro")}>
                        {busy ? "Indo para Stripe..." : "Assinar Pro"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Business */}
                <div className={`rounded-[var(--flux-rad)] border p-5 ${plan === "business" ? "border-[var(--flux-secondary-alpha-55)] bg-[var(--flux-secondary-alpha-10)]" : "border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]"}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">Business</p>
                  <p className="mt-2 font-display text-2xl font-bold text-[var(--flux-text)]">R$/usuário/mês</p>
                  <div className="mt-3 space-y-1 text-xs text-[var(--flux-text-muted)]">
                    <p>Boards: ∞</p>
                    <p>Usuários: ∞</p>
                    <p>Calls/dia: ∞</p>
                  </div>
                  <ul className="mt-4 text-xs text-[var(--flux-text-muted)] space-y-1 list-disc pl-4">
                    <li>Multi-tenant</li>
                    <li>API</li>
                    <li>Audit log</li>
                    <li>Webhooks</li>
                    <li>SLA, suporte</li>
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
                      disabled={busy || plan === "business"}
                    />
                  </div>
                  <div className="mt-5">
                    {plan === "business" ? (
                      <button disabled className="btn-secondary w-full">
                        Business ativo
                      </button>
                    ) : (
                      <button disabled={busy || seats < 1} className="btn-primary w-full" onClick={() => startCheckout("business")}>
                        {busy ? "Indo para Stripe..." : "Assinar Business"}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-6 text-xs text-[var(--flux-text-muted)]">
                Dica: seats devem refletir a quantidade de usuários da sua organização.
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

