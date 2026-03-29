"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { Header } from "@/components/header";
import { apiGet, apiPatch, ApiError } from "@/lib/api-client";
import { useToast } from "@/context/toast-context";
import { isPlatformAdminSession } from "@/lib/rbac";
import type { CommercialDisplayPricing } from "@/lib/platform-commercial-settings";
import { PRICING_BRL } from "@/lib/billing-pricing";

type Effective = {
  proEnabled: boolean;
  businessEnabled: boolean;
  pricing: CommercialDisplayPricing;
};

export default function PlatformCommercialAdminPage() {
  const router = useRouter();
  const { user, getHeaders, isChecked, refreshSession } = useAuth();
  const { pushToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [proEnabled, setProEnabled] = useState(true);
  const [businessEnabled, setBusinessEnabled] = useState(true);
  const [proSeatMonth, setProSeatMonth] = useState<number>(PRICING_BRL.proSeatMonth);
  const [proSeatYear, setProSeatYear] = useState<number>(PRICING_BRL.proSeatYear);
  const [businessSeatMonth, setBusinessSeatMonth] = useState<number>(PRICING_BRL.businessSeatMonth);
  const [businessSeatYear, setBusinessSeatYear] = useState<number>(PRICING_BRL.businessSeatYear);
  const [publishStripe, setPublishStripe] = useState(false);

  const [profName, setProfName] = useState("");
  const [profEmail, setProfEmail] = useState("");
  const [profCurrentPwd, setProfCurrentPwd] = useState("");
  const [profNewPwd, setProfNewPwd] = useState("");
  const [profBusy, setProfBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ effective?: Effective }>("/api/platform/commercial-settings", getHeaders());
      const e = data?.effective;
      if (e) {
        setProEnabled(e.proEnabled);
        setBusinessEnabled(e.businessEnabled);
        setProSeatMonth(e.pricing.proSeatMonth);
        setProSeatYear(e.pricing.proSeatYear);
        setBusinessSeatMonth(e.pricing.businessSeatMonth);
        setBusinessSeatYear(e.pricing.businessSeatYear);
      }
      if (user) {
        setProfName(user.name ?? "");
        setProfEmail(user.email ?? "");
      }
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        router.replace("/boards");
        return;
      }
      pushToast({ kind: "error", title: "Erro ao carregar", description: e instanceof Error ? e.message : "Falha" });
    } finally {
      setLoading(false);
    }
  }, [getHeaders, router, pushToast, user]);

  useEffect(() => {
    if (!isChecked || !user) {
      router.replace("/login");
      return;
    }
    if (!isPlatformAdminSession(user)) {
      router.replace("/boards");
      return;
    }
    void load();
  }, [isChecked, user, router, load]);

  useEffect(() => {
    if (user) {
      setProfName(user.name ?? "");
      setProfEmail(user.email ?? "");
    }
  }, [user]);

  async function onSaveCommercial() {
    setSaving(true);
    try {
      await apiPatch(
        "/api/platform/commercial-settings",
        {
          proEnabled,
          businessEnabled,
          proSeatMonth,
          proSeatYear,
          businessSeatMonth,
          businessSeatYear,
          publishStripe,
        },
        getHeaders()
      );
      pushToast({
        kind: "success",
        title: "Configuração salva",
        description: publishStripe
          ? "Preços publicados no Stripe (novos checkouts). Assinaturas antigas permanecem no preço anterior até troca no portal."
          : "Valores de vitrine e catálogo atualizados.",
      });
      setPublishStripe(false);
      await load();
    } catch (e) {
      if (e instanceof ApiError) {
        pushToast({
          kind: "error",
          title: "Falha ao salvar",
          description: (e.data as { error?: string })?.error ?? e.message,
        });
      } else {
        pushToast({ kind: "error", title: "Falha ao salvar", description: e instanceof Error ? e.message : "Erro" });
      }
    } finally {
      setSaving(false);
    }
  }

  async function onSaveProfile() {
    setProfBusy(true);
    try {
      const body: Record<string, string> = {};
      if (profName.trim()) body.name = profName.trim();
      if (profEmail.trim()) body.email = profEmail.trim().toLowerCase();
      if (profNewPwd.length > 0) {
        body.newPassword = profNewPwd;
        body.currentPassword = profCurrentPwd;
      }
      if (Object.keys(body).length === 0) {
        pushToast({ kind: "error", title: "Nada para salvar", description: "Altere nome, e-mail ou senha." });
        return;
      }
      await apiPatch("/api/platform/admin/profile", body, getHeaders());
      pushToast({ kind: "success", title: "Perfil atualizado", description: "Suas alterações foram salvas." });
      setProfCurrentPwd("");
      setProfNewPwd("");
      await refreshSession();
    } catch (e) {
      if (e instanceof ApiError) {
        pushToast({
          kind: "error",
          title: "Falha no perfil",
          description: (e.data as { error?: string })?.error ?? e.message,
        });
      } else {
        pushToast({ kind: "error", title: "Falha no perfil", description: e instanceof Error ? e.message : "Erro" });
      }
    } finally {
      setProfBusy(false);
    }
  }

  if (!isChecked || !user || !isPlatformAdminSession(user)) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[var(--flux-surface-dark)] text-[var(--flux-text)]">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8 md:px-6">
        <h1 className="font-display text-2xl font-bold text-[var(--flux-text)]">Planos e cobrança (plataforma)</h1>
        <p className="mt-2 text-sm text-[var(--flux-text-muted)]">
          Valores em BRL por assento, com até <strong>duas casas decimais</strong> (centavos). Use ponto no campo numérico
          (ex.: <code className="text-xs">49.90</code>). Marque &quot;Publicar no Stripe&quot; para criar novos preços na
          Stripe quando alterar valores; assinaturas existentes não migram automaticamente.
        </p>

        {loading ? (
          <p className="mt-8 text-sm text-[var(--flux-text-muted)]">Carregando…</p>
        ) : (
          <div className="mt-8 space-y-6 rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={proEnabled} onChange={(e) => setProEnabled(e.target.checked)} />
                Pro disponível no catálogo e checkout
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={businessEnabled} onChange={(e) => setBusinessEnabled(e.target.checked)} />
                Business disponível no catálogo e checkout
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)]">Pro R$/seat/mês</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  inputMode="decimal"
                  className="mt-1 w-full rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm"
                  value={proSeatMonth}
                  onChange={(e) => {
                    const v = Number.parseFloat(e.target.value);
                    setProSeatMonth(Number.isFinite(v) ? v : 0);
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)]">
                  Pro R$/seat/mês (anual, equivalente)
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  inputMode="decimal"
                  className="mt-1 w-full rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm"
                  value={proSeatYear}
                  onChange={(e) => {
                    const v = Number.parseFloat(e.target.value);
                    setProSeatYear(Number.isFinite(v) ? v : 0);
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)]">Business R$/seat/mês</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  inputMode="decimal"
                  className="mt-1 w-full rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm"
                  value={businessSeatMonth}
                  onChange={(e) => {
                    const v = Number.parseFloat(e.target.value);
                    setBusinessSeatMonth(Number.isFinite(v) ? v : 0);
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)]">
                  Business R$/seat/mês (anual, equivalente)
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  inputMode="decimal"
                  className="mt-1 w-full rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm"
                  value={businessSeatYear}
                  onChange={(e) => {
                    const v = Number.parseFloat(e.target.value);
                    setBusinessSeatYear(Number.isFinite(v) ? v : 0);
                  }}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={publishStripe} onChange={(e) => setPublishStripe(e.target.checked)} />
              Publicar no Stripe (criar novos Prices quando necessário; requer STRIPE_SECRET_KEY e Price IDs base no env)
            </label>

            <button type="button" disabled={saving} className="btn-primary" onClick={() => void onSaveCommercial()}>
              {saving ? "Salvando…" : "Salvar configuração"}
            </button>
          </div>
        )}

        <section className="mt-12 space-y-4 rounded-[var(--flux-rad-xl)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] p-6">
          <h2 className="font-display text-lg font-bold">Sua conta (admin da plataforma)</h2>
          <div>
            <label className="block text-xs font-semibold text-[var(--flux-text-muted)]">Nome</label>
            <input
              className="mt-1 w-full rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm"
              value={profName}
              onChange={(e) => setProfName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--flux-text-muted)]">E-mail</label>
            <input
              type="email"
              className="mt-1 w-full rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm"
              value={profEmail}
              onChange={(e) => setProfEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--flux-text-muted)]">Senha atual (para trocar senha)</label>
            <input
              type="password"
              autoComplete="current-password"
              className="mt-1 w-full rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm"
              value={profCurrentPwd}
              onChange={(e) => setProfCurrentPwd(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--flux-text-muted)]">Nova senha (mín. 8 caracteres)</label>
            <input
              type="password"
              autoComplete="new-password"
              className="mt-1 w-full rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm"
              value={profNewPwd}
              onChange={(e) => setProfNewPwd(e.target.value)}
            />
          </div>
          <button type="button" disabled={profBusy} className="btn-secondary" onClick={() => void onSaveProfile()}>
            {profBusy ? "Salvando…" : "Salvar perfil"}
          </button>
        </section>
      </main>
    </div>
  );
}
