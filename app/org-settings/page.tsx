"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { apiGet, apiPost, apiPut, ApiError } from "@/lib/api-client";
import { Header } from "@/components/header";
import { useToast } from "@/context/toast-context";
import { useOrgBranding } from "@/context/org-branding-context";
import { readImageFileAsDataUrl } from "@/lib/branding-upload-client";
import { OrgWebhooksSettings } from "@/components/org-webhooks-settings";

function slugifyLocal(input: string): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const CNAME_TARGET =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_CUSTOM_DOMAIN_CNAME_TARGET) || "cname.vercel-dns.com";

export default function OrgSettingsPage() {
  const router = useRouter();
  const { user, getHeaders, isChecked } = useAuth();
  const locale = useLocale();
  const tNav = useTranslations("navigation");
  const t = useTranslations("onboarding");
  const localeRoot = `/${locale}`;
  const { pushToast } = useToast();
  const orgBranding = useOrgBranding();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [orgPlan, setOrgPlan] = useState<"free" | "trial" | "pro" | "business">("free");
  const [slugTouched, setSlugTouched] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("");
  const [secondaryColor, setSecondaryColor] = useState("");
  const [accentColor, setAccentColor] = useState("");
  const [platformName, setPlatformName] = useState("");
  const [faviconUrl, setFaviconUrl] = useState("");
  const [emailFrom, setEmailFrom] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [domainVerificationToken, setDomainVerificationToken] = useState("");
  const [customDomainVerifiedAt, setCustomDomainVerifiedAt] = useState("");
  const [stripeCustomerId, setStripeCustomerId] = useState<string | null>(null);
  const [aiAnthropicModel, setAiAnthropicModel] = useState("");
  const [aiBatchProvider, setAiBatchProvider] = useState<"anthropic" | "together" | "">("");
  const [claudeUserIds, setClaudeUserIds] = useState<string[]>([]);
  const [orgUsers, setOrgUsers] = useState<Array<{ id: string; email?: string; name?: string }>>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [invoices, setInvoices] = useState<
    Array<{
      id: string;
      number: string | null;
      status: string | null;
      created: number;
      amountDue: number;
      currency: string;
      invoicePdf: string | null;
      hostedInvoiceUrl: string | null;
    }>
  >([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);

  const suggestedSlug = useMemo(() => slugifyLocal(orgName), [orgName]);

  function applyOrgPayload(org: Record<string, unknown> | null | undefined) {
    if (!org) return;
    setOrgName(String(org.name ?? ""));
    setOrgSlug(String(org.slug ?? ""));
    setOrgPlan(
      org.plan === "pro" || org.plan === "business"
        ? org.plan
        : org.plan === "trial"
          ? "trial"
          : "free"
    );
    const b = org.branding as Record<string, unknown> | undefined;
    setLogoUrl(typeof b?.logoUrl === "string" ? b.logoUrl : "");
    setPrimaryColor(typeof b?.primaryColor === "string" ? b.primaryColor : "");
    setSecondaryColor(typeof b?.secondaryColor === "string" ? b.secondaryColor : "");
    setAccentColor(typeof b?.accentColor === "string" ? b.accentColor : "");
    setPlatformName(typeof b?.platformName === "string" ? b.platformName : "");
    setFaviconUrl(typeof b?.faviconUrl === "string" ? b.faviconUrl : "");
    setEmailFrom(typeof b?.emailFrom === "string" ? b.emailFrom : "");
    setCustomDomain(typeof b?.customDomain === "string" ? b.customDomain : "");
    setDomainVerificationToken(typeof b?.domainVerificationToken === "string" ? b.domainVerificationToken : "");
    setCustomDomainVerifiedAt(typeof b?.customDomainVerifiedAt === "string" ? b.customDomainVerifiedAt : "");
    setStripeCustomerId(typeof org.stripeCustomerId === "string" ? org.stripeCustomerId : null);
    const ai = org.aiSettings as Record<string, unknown> | undefined;
    setAiAnthropicModel(typeof ai?.anthropicModel === "string" ? ai.anthropicModel : "");
    const bp = ai?.batchLlmProvider;
    setAiBatchProvider(bp === "anthropic" || bp === "together" ? bp : "");
    const cu = ai?.claudeUserIds;
    setClaudeUserIds(Array.isArray(cu) ? cu.map((x) => String(x)).filter(Boolean) : []);
  }

  useEffect(() => {
    if (!isChecked || !user) {
      router.replace(`${localeRoot}/login`);
      return;
    }
    if (!user.isAdmin) {
      router.replace(`${localeRoot}/boards`);
      return;
    }

    setLoading(true);
    setError(null);
    (async () => {
      try {
        const data = await apiGet<{ organization: Record<string, unknown> }>("/api/organizations/me", getHeaders());
        applyOrgPayload(data?.organization);
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          router.replace(`${localeRoot}/login`);
          return;
        }
        setError(e instanceof ApiError ? e.message : "Erro ao carregar organização.");
      } finally {
        setLoading(false);
      }
    })();
  }, [isChecked, user, router, localeRoot, getHeaders]);

  useEffect(() => {
    if (!isChecked || !user?.isAdmin || orgPlan !== "business") {
      setOrgUsers([]);
      return;
    }
    setUsersLoading(true);
    (async () => {
      try {
        const data = await apiGet<{ users: Array<{ id: string; email?: string; name?: string }> }>("/api/users", getHeaders());
        setOrgUsers(Array.isArray(data?.users) ? data.users : []);
      } catch {
        setOrgUsers([]);
      } finally {
        setUsersLoading(false);
      }
    })();
  }, [isChecked, user?.isAdmin, orgPlan, getHeaders]);

  useEffect(() => {
    if (!isChecked || !user?.isAdmin || !stripeCustomerId) {
      setInvoices([]);
      return;
    }
    setInvoicesLoading(true);
    (async () => {
      try {
        const data = await apiGet<{
          invoices: Array<{
            id: string;
            number: string | null;
            status: string | null;
            created: number;
            amountDue: number;
            currency: string;
            invoicePdf: string | null;
            hostedInvoiceUrl: string | null;
          }>;
        }>("/api/billing/invoices", getHeaders());
        setInvoices(Array.isArray(data?.invoices) ? data.invoices : []);
      } catch {
        setInvoices([]);
      } finally {
        setInvoicesLoading(false);
      }
    })();
  }, [isChecked, user?.isAdmin, stripeCustomerId, getHeaders]);

  useEffect(() => {
    if (!slugTouched) setOrgSlug(suggestedSlug);
  }, [suggestedSlug, slugTouched]);

  async function save(extraBranding?: Record<string, unknown>) {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const name = orgName.trim();
      const slug = orgSlug.trim();
      if (!name) throw new Error("Nome é obrigatório.");
      if (!slug) throw new Error("Slug é obrigatório.");

      const branding =
        orgPlan === "pro" || orgPlan === "business"
          ? {
              logoUrl: logoUrl.trim() || "",
              primaryColor: primaryColor.trim() || "",
              secondaryColor: secondaryColor.trim() || "",
              accentColor: accentColor.trim() || "",
              platformName: platformName.trim() || "",
              faviconUrl: faviconUrl.trim() || "",
              emailFrom: emailFrom.trim() || "",
              ...(orgPlan === "business" ? { customDomain: customDomain.trim() || "" } : {}),
              ...extraBranding,
            }
          : undefined;

      const aiSettings =
        orgPlan === "business"
          ? {
              anthropicModel: aiAnthropicModel.trim() || null,
              batchLlmProvider: aiBatchProvider || null,
              claudeUserIds: claudeUserIds.length ? claudeUserIds : null,
            }
          : undefined;

      const res = await apiPut<{ organization: Record<string, unknown> }>(
        "/api/organizations/me",
        branding
          ? { name, slug, branding, ...(aiSettings ? { aiSettings } : {}) }
          : { name, slug, ...(aiSettings ? { aiSettings } : {}) },
        getHeaders()
      );
      applyOrgPayload(res?.organization);
      pushToast({ kind: "success", title: "Organização atualizada." });
      setSlugTouched(true);
      await orgBranding?.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyDns() {
    setVerifyBusy(true);
    setError(null);
    try {
      const res = await apiPost<{ organization?: Record<string, unknown> }>(
        "/api/organizations/verify-domain",
        {},
        getHeaders()
      );
      if (res?.organization) applyOrgPayload(res.organization);
      pushToast({ kind: "success", title: "Domínio verificado." });
      await orgBranding?.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Falha na verificação.");
    } finally {
      setVerifyBusy(false);
    }
  }

  async function onLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const dataUrl = await readImageFileAsDataUrl(f);
      setLogoUrl(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Arquivo inválido.");
    }
  }

  async function onFaviconFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const dataUrl = await readImageFileAsDataUrl(f);
      setFaviconUrl(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Arquivo inválido.");
    }
  }

  return (
    <div className="min-h-screen bg-[var(--flux-surface-dark)]">
      <Header title={tNav("organization")} backHref={`${localeRoot}/boards`} backLabel="← Boards">
        <div className="text-xs text-[var(--flux-text-muted)]">{t("steps.pill1")}</div>
      </Header>
      <main className="max-w-[780px] mx-auto px-6 py-10">
        <div className="rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] p-6 shadow-[var(--flux-shadow-elevated-card)]">
          <h2 className="font-display font-bold text-xl text-[var(--flux-text)] mb-1">Configuração da Organização</h2>
          <p className="text-sm text-[var(--flux-text-muted)] mb-6">
            O `slug` é usado para URLs/escopo do tenant. Ele precisa ser único.
          </p>

          {loading ? (
            <p className="text-[var(--flux-text-muted)]">Carregando...</p>
          ) : (
            <>
              {error && (
                <div className="mb-4 bg-[var(--flux-danger-alpha-12)] border border-[var(--flux-danger-alpha-30)] text-[var(--flux-danger)] p-3 rounded-[var(--flux-rad)] text-sm">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">Nome</label>
                  <input
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--flux-chrome-alpha-12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                    disabled={busy}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">Slug</label>
                  <input
                    value={orgSlug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setOrgSlug(e.target.value);
                    }}
                    className="w-full px-3 py-2 border border-[var(--flux-chrome-alpha-12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)] font-mono"
                    disabled={busy}
                  />
                  <p className="mt-2 text-xs text-[var(--flux-text-muted)]">
                    Sugestão: <code className="font-mono">{suggestedSlug || "—"}</code>
                  </p>
                </div>
              </div>

              {(orgPlan === "pro" || orgPlan === "business" || orgPlan === "trial") && (
                <div className="mt-8 pt-8 border-t border-[var(--flux-primary-alpha-15)] space-y-6">
                  <div>
                    <h3 className="font-display font-bold text-lg text-[var(--flux-text)] mb-1">White-label (Enterprise)</h3>
                    <p className="text-sm text-[var(--flux-text-muted)]">
                      Logo, cores, nome da plataforma e favicon em todo o app, portal e e-mails. Plano Business: domínio
                      próprio e remetente no Resend.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">Nome da plataforma</label>
                      <input
                        value={platformName}
                        onChange={(e) => setPlatformName(e.target.value)}
                        className="w-full px-3 py-2 border border-[var(--flux-chrome-alpha-12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)]"
                        disabled={busy}
                        placeholder="Ex.: Portal do Cliente ACME"
                        maxLength={80}
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">Logo (URL ou upload PNG/SVG até 2MB)</label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          value={logoUrl}
                          onChange={(e) => setLogoUrl(e.target.value)}
                          className="flex-1 min-w-0 px-3 py-2 border border-[var(--flux-chrome-alpha-12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)]"
                          disabled={busy}
                          placeholder="https://… ou envie um arquivo"
                        />
                        <label className="shrink-0 px-3 py-2 rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] text-xs font-semibold text-center cursor-pointer hover:border-[var(--flux-primary)]">
                          Upload
                          <input type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" className="hidden" onChange={onLogoFile} disabled={busy} />
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">Cor primária</label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={primaryColor && /^#[0-9a-fA-F]{3,8}$/.test(primaryColor) ? primaryColor : "#6C5CE7"}
                          onChange={(e) => setPrimaryColor(e.target.value)}
                          className="h-10 w-14 p-1 rounded border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]"
                          disabled={busy}
                          aria-label="Cor primária"
                        />
                        <input
                          value={primaryColor}
                          onChange={(e) => setPrimaryColor(e.target.value)}
                          className="flex-1 px-3 py-2 border border-[var(--flux-chrome-alpha-12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] font-mono"
                          disabled={busy}
                          placeholder="#6C5CE7"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">Cor secundária</label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={secondaryColor && /^#[0-9a-fA-F]{3,8}$/.test(secondaryColor) ? secondaryColor : "#00D2D3"}
                          onChange={(e) => setSecondaryColor(e.target.value)}
                          className="h-10 w-14 p-1 rounded border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]"
                          disabled={busy}
                          aria-label="Cor secundária"
                        />
                        <input
                          value={secondaryColor}
                          onChange={(e) => setSecondaryColor(e.target.value)}
                          className="flex-1 px-3 py-2 border border-[var(--flux-chrome-alpha-12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] font-mono"
                          disabled={busy}
                          placeholder="#00D2D3"
                        />
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">Cor de destaque (accent)</label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={accentColor && /^#[0-9a-fA-F]{3,8}$/.test(accentColor) ? accentColor : "#FDA7DF"}
                          onChange={(e) => setAccentColor(e.target.value)}
                          className="h-10 w-14 p-1 rounded border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]"
                          disabled={busy}
                          aria-label="Accent"
                        />
                        <input
                          value={accentColor}
                          onChange={(e) => setAccentColor(e.target.value)}
                          className="flex-1 px-3 py-2 border border-[var(--flux-chrome-alpha-12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] font-mono"
                          disabled={busy}
                          placeholder="#FDA7DF"
                        />
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">Favicon (URL ou upload)</label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          value={faviconUrl}
                          onChange={(e) => setFaviconUrl(e.target.value)}
                          className="flex-1 min-w-0 px-3 py-2 border border-[var(--flux-chrome-alpha-12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)]"
                          disabled={busy}
                          placeholder="https://… ou arquivo .ico/.png"
                        />
                        <label className="shrink-0 px-3 py-2 rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] text-xs font-semibold text-center cursor-pointer hover:border-[var(--flux-primary)]">
                          Upload
                          <input type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp,.ico" className="hidden" onChange={onFaviconFile} disabled={busy} />
                        </label>
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">E-mail remetente (Resend)</label>
                      <input
                        value={emailFrom}
                        onChange={(e) => setEmailFrom(e.target.value)}
                        className="w-full px-3 py-2 border border-[var(--flux-chrome-alpha-12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] font-mono"
                        disabled={busy}
                        placeholder="notificacoes@suaempresa.com"
                      />
                      <p className="mt-1 text-xs text-[var(--flux-text-muted)]">
                        O domínio do endereço deve estar verificado em{" "}
                        <a href="https://resend.com/docs/dashboard/domains/introduction" className="underline text-[var(--flux-secondary)]" target="_blank" rel="noreferrer">
                          Resend → Domains
                        </a>
                        . Usado no Weekly Digest e alertas de anomalia.
                      </p>
                    </div>

                    {orgPlan === "business" && (
                      <div className="md:col-span-2 space-y-3 rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-15)] bg-[var(--flux-surface-elevated)]/40 p-4">
                        <div>
                          <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">Domínio customizado</label>
                          <input
                            value={customDomain}
                            onChange={(e) => setCustomDomain(e.target.value)}
                            className="w-full px-3 py-2 border border-[var(--flux-chrome-alpha-12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] font-mono"
                            disabled={busy}
                            placeholder="board.cliente.com"
                          />
                        </div>
                        <div className="text-xs text-[var(--flux-text-muted)] space-y-2">
                          <p>
                            <strong className="text-[var(--flux-text)]">SSL:</strong> adicione o hostname no painel Vercel (ou seu provedor) apontando CNAME para{" "}
                            <code className="font-mono text-[var(--flux-text)]">{CNAME_TARGET}</code>.{" "}
                            <a href="https://vercel.com/docs/domains/working-with-domains/add-a-domain" className="underline text-[var(--flux-secondary)]" target="_blank" rel="noreferrer">
                              Documentação Vercel
                            </a>
                          </p>
                          <p>
                            <strong className="text-[var(--flux-text)]">Verificação DNS:</strong> crie um registro{" "}
                            <strong>TXT</strong> no hostname acima com valor:
                          </p>
                          <code className="block font-mono text-[11px] break-all p-2 rounded bg-[var(--flux-surface-dark)] text-[var(--flux-text)]">
                            flux-verify={domainVerificationToken || "…salve o domínio para gerar o token"}
                          </code>
                          <div className="flex flex-wrap gap-2 pt-1">
                            <button
                              type="button"
                              className="btn-primary text-xs py-1.5 px-3"
                              disabled={verifyBusy || !customDomain.trim() || busy}
                              onClick={() => void verifyDns()}
                            >
                              {verifyBusy ? "Verificando…" : "Verificar registro TXT"}
                            </button>
                            <button
                              type="button"
                              className="btn-secondary text-xs py-1.5 px-3"
                              disabled={busy || !customDomain.trim()}
                              onClick={() => void save({ regenerateDomainToken: true })}
                            >
                              Novo token
                            </button>
                          </div>
                          {customDomainVerifiedAt ? (
                            <p className="text-[var(--flux-success)] pt-1">Verificado em {new Date(customDomainVerifiedAt).toLocaleString()}.</p>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {orgPlan === "business" && (
                <div className="mt-8 pt-8 border-t border-[var(--flux-primary-alpha-15)] space-y-4">
                  <div>
                    <h3 className="font-display font-bold text-lg text-[var(--flux-text)] mb-1">IA (Business)</h3>
                    <p className="text-sm text-[var(--flux-text-muted)]">
                      Modelo Claude para a org, digest semanal em lote e quem mais pode usar a rota Claude além dos
                      administradores.
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">
                      Modelo Anthropic (Claude)
                    </label>
                    <input
                      value={aiAnthropicModel}
                      onChange={(e) => setAiAnthropicModel(e.target.value)}
                      className="w-full px-3 py-2 border border-[var(--flux-chrome-alpha-12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] font-mono"
                      disabled={busy}
                      placeholder="claude-3-5-sonnet-20241022"
                      maxLength={120}
                    />
                    <p className="mt-1 text-xs text-[var(--flux-text-muted)]">Vazio usa ANTHROPIC_MODEL ou o padrão do servidor.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">Digest / jobs em lote</label>
                    <select
                      value={aiBatchProvider}
                      onChange={(e) => setAiBatchProvider(e.target.value as "anthropic" | "together" | "")}
                      className="w-full px-3 py-2 border border-[var(--flux-chrome-alpha-12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)]"
                      disabled={busy}
                    >
                      <option value="">Padrão (Together se configurado)</option>
                      <option value="together">Together (Llama)</option>
                      <option value="anthropic">Anthropic (Claude)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">
                      Usuários com rota Claude (além de admins)
                    </label>
                    {usersLoading ? (
                      <p className="text-xs text-[var(--flux-text-muted)]">Carregando usuários…</p>
                    ) : (
                      <div className="max-h-40 overflow-y-auto rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] p-2 space-y-1">
                        {orgUsers.map((u) => {
                          const id = String(u.id || "");
                          if (!id) return null;
                          const label = [u.name, u.email].filter(Boolean).join(" · ") || id;
                          return (
                            <label key={id} className="flex items-center gap-2 text-sm text-[var(--flux-text)] cursor-pointer">
                              <input
                                type="checkbox"
                                checked={claudeUserIds.includes(id)}
                                onChange={(ev) => {
                                  setClaudeUserIds((prev) =>
                                    ev.target.checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)
                                  );
                                }}
                                disabled={busy}
                              />
                              <span className="truncate">{label}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => router.replace(`${localeRoot}/boards`)}
                >
                  Cancelar
                </button>
                <button type="button" className="btn-primary" disabled={busy} onClick={() => void save()}>
                  {busy ? "Salvando..." : "Salvar"}
                </button>
              </div>

              {user?.isAdmin && stripeCustomerId ? (
                <div className="mt-10 pt-10 border-t border-[var(--flux-primary-alpha-15)]">
                  <h3 className="font-display font-bold text-lg text-[var(--flux-text)] mb-1">Faturas (Stripe)</h3>
                  <p className="text-sm text-[var(--flux-text-muted)] mb-4">
                    Histórico de cobranças. PDF e página hospedada vêm do Stripe.
                  </p>
                  {invoicesLoading ? (
                    <p className="text-sm text-[var(--flux-text-muted)]">Carregando faturas…</p>
                  ) : invoices.length === 0 ? (
                    <p className="text-sm text-[var(--flux-text-muted)]">Nenhuma fatura ainda.</p>
                  ) : (
                    <ul className="space-y-2">
                      {invoices.map((inv) => {
                        const date = new Date(inv.created * 1000).toLocaleDateString(locale === "en" ? "en-US" : "pt-BR");
                        const href = inv.invoicePdf || inv.hostedInvoiceUrl;
                        return (
                          <li
                            key={inv.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm"
                          >
                            <span className="text-[var(--flux-text)]">
                              {inv.number || inv.id}
                              <span className="text-[var(--flux-text-muted)]"> · {date}</span>
                              {inv.status ? (
                                <span className="ml-2 text-xs uppercase text-[var(--flux-text-muted)]">{inv.status}</span>
                              ) : null}
                            </span>
                            {href ? (
                              <a
                                href={href}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-semibold text-[var(--flux-primary-light)] underline-offset-2 hover:underline"
                              >
                                PDF / Ver fatura
                              </a>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ) : null}

              <OrgWebhooksSettings />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
