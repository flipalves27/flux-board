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
import { PushNotificationsSettings } from "@/components/push-notifications-settings";
import { isPlatformAdminSession, sessionCanManageMembersAndBilling } from "@/lib/rbac";

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
  const opsPlatformAdmin = Boolean(user && isPlatformAdminSession(user));
  const locale = useLocale();
  const tNav = useTranslations("navigation");
  const t = useTranslations("onboarding");
  const tOrg = useTranslations("orgSettings");
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
  const [aiTogetherModel, setAiTogetherModel] = useState("");
  const [aiApiKeyInput, setAiApiKeyInput] = useState("");
  const [aiBaseUrl, setAiBaseUrl] = useState("");
  const [aiAdvancedOpen, setAiAdvancedOpen] = useState(false);
  const [showAiKey, setShowAiKey] = useState(false);
  const [hasOrgApiKey, setHasOrgApiKey] = useState(false);
  const [removeKeyOpen, setRemoveKeyOpen] = useState(false);
  type OrgSettingsTab = "identity" | "branding" | "ai" | "billing" | "integrations";
  const [activeTab, setActiveTab] = useState<OrgSettingsTab>("identity");
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
  /** Env + sem assinatura Stripe — mostra seletor de plano manual. */
  const [canAdminOverridePlan, setCanAdminOverridePlan] = useState(false);
  /** Env ativa mas org tem `stripeSubscriptionId` — override bloqueado (billing). */
  const [planOverrideBlockedByStripe, setPlanOverrideBlockedByStripe] = useState(false);

  const suggestedSlug = useMemo(() => slugifyLocal(orgName), [orgName]);

  function applyOrgPayload(org: Record<string, unknown> | null | undefined) {
    if (!org) return;
    if (typeof org.canAdminOverridePlan === "boolean") setCanAdminOverridePlan(org.canAdminOverridePlan);
    if (typeof org.planOverrideBlockedByStripe === "boolean") setPlanOverrideBlockedByStripe(org.planOverrideBlockedByStripe);
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
    setAiTogetherModel(typeof ai?.togetherModel === "string" ? ai.togetherModel : "");
    setHasOrgApiKey(Boolean(ai?.hasOrgApiKey));
    setAiApiKeyInput("");
    setShowAiKey(false);
  }

  useEffect(() => {
    if (!isChecked || !user) {
      router.replace(`${localeRoot}/login`);
      return;
    }
    if (!sessionCanManageMembersAndBilling(user)) {
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
        setError(e instanceof ApiError ? e.message : tOrg("errorLoadOrg"));
      } finally {
        setLoading(false);
      }
    })();
  }, [isChecked, user, router, localeRoot, getHeaders, tOrg]);

  useEffect(() => {
    if (!isChecked || !user || !sessionCanManageMembersAndBilling(user) || !stripeCustomerId) {
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
  }, [isChecked, user, stripeCustomerId, getHeaders]);

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
      if (!name) throw new Error(tOrg("errorNameRequired"));
      if (!slug) throw new Error(tOrg("errorSlugRequired"));

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

      const aiSettings: Record<string, unknown> = {
        togetherModel: aiTogetherModel.trim() || null,
      };
      if (aiApiKeyInput.trim()) aiSettings.togetherApiKey = aiApiKeyInput.trim();
      if (aiBaseUrl.trim()) aiSettings.togetherBaseUrl = aiBaseUrl.trim();

      const planBody = canAdminOverridePlan ? { plan: orgPlan } : {};
      const res = await apiPut<{ organization: Record<string, unknown> }>(
        "/api/organizations/me",
        branding
          ? { name, slug, ...planBody, branding, aiSettings }
          : { name, slug, ...planBody, aiSettings },
        getHeaders()
      );
      applyOrgPayload(res?.organization);
      pushToast({ kind: "success", title: tOrg("saved") });
      setSlugTouched(true);
      await orgBranding?.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : tOrg("errorSave"));
    } finally {
      setBusy(false);
    }
  }

  async function removeOrgAiKey() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiPut<{ organization: Record<string, unknown> }>(
        "/api/organizations/me",
        { aiSettings: { removeTogetherSecrets: true, togetherModel: aiTogetherModel.trim() || null } },
        getHeaders()
      );
      applyOrgPayload(res?.organization);
      setRemoveKeyOpen(false);
      pushToast({ kind: "success", title: tOrg("saved") });
      await orgBranding?.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : tOrg("errorSave"));
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
      pushToast({ kind: "success", title: tOrg("verifyDomainSuccess") });
      await orgBranding?.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : tOrg("errorVerifyDomain"));
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
      setError(err instanceof Error ? err.message : tOrg("invalidFile"));
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
      setError(err instanceof Error ? err.message : tOrg("invalidFile"));
    }
  }

  return (
    <div className="min-h-screen">
      <Header title={tNav("organization")} backHref={`${localeRoot}/boards`} backLabel="← Boards">
        <div className="text-xs text-[var(--flux-text-muted)]">{t("steps.pill1")}</div>
      </Header>
      <main className="max-w-[780px] mx-auto px-4 py-6 sm:px-6 sm:py-10">
        <div className="rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] p-6 shadow-[var(--flux-shadow-elevated-card)]">
          <h2 className="font-display font-bold text-xl text-[var(--flux-text)] mb-1">{tOrg("pageTitle")}</h2>
          <p className="text-sm text-[var(--flux-text-muted)] mb-6">{tOrg("pageSubtitle")}</p>

          {loading ? (
            <div className="space-y-3 motion-safe:animate-pulse" aria-busy="true">
              <div className="h-9 rounded-[var(--flux-rad)] bg-[var(--flux-chrome-alpha-12)]" />
              <div className="h-9 rounded-[var(--flux-rad)] bg-[var(--flux-chrome-alpha-12)]" />
              <div className="h-24 rounded-[var(--flux-rad)] bg-[var(--flux-chrome-alpha-12)]" />
              <p className="text-xs text-[var(--flux-text-muted)]">{tOrg("loading")}</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 bg-[var(--flux-danger-alpha-12)] border border-[var(--flux-danger-alpha-30)] text-[var(--flux-danger)] p-3 rounded-[var(--flux-rad)] text-sm">
                  {error}
                </div>
              )}

              <div
                role="tablist"
                aria-label={tOrg("pageTitle")}
                className="-mx-1 mb-5 flex flex-wrap gap-1 overflow-x-auto border-b border-[var(--flux-chrome-alpha-12)] pb-2 sm:flex-nowrap"
              >
                {(
                  [
                    ["identity", "tabIdentity"],
                    ["branding", "tabBranding"],
                    ["ai", "tabAi"],
                    ["billing", "tabBilling"],
                    ["integrations", "tabIntegrations"],
                  ] as const
                ).map(([id, labelKey]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    id={`org-tab-${id}`}
                    aria-controls={`org-panel-${id}`}
                    aria-selected={activeTab === id}
                    tabIndex={activeTab === id ? 0 : -1}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-[var(--flux-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--flux-surface-card)] ${
                      activeTab === id
                        ? "bg-[var(--flux-primary-alpha-20)] text-[var(--flux-text)] ring-1 ring-[var(--flux-primary-alpha-35)]"
                        : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
                    }`}
                    onClick={() => setActiveTab(id)}
                  >
                    {tOrg(labelKey)}
                  </button>
                ))}
              </div>

              <div
                role="tabpanel"
                id="org-panel-identity"
                aria-labelledby="org-tab-identity"
                hidden={activeTab !== "identity"}
                className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]/25 p-4 sm:p-5 motion-safe:transition-opacity motion-safe:duration-200 motion-reduce:transition-none"
              >
                <h3 className="font-display font-bold text-sm text-[var(--flux-text)] mb-3">{tOrg("identityHeading")}</h3>
                <p className="text-xs text-[var(--flux-text-muted)] mb-4">{tOrg("slugHint")}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">{tOrg("nameLabel")}</label>
                  <input
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--flux-chrome-alpha-12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                    disabled={busy}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">{tOrg("slugLabel")}</label>
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
                    {tOrg("suggestedSlug", { slug: suggestedSlug || "—" })}
                  </p>
                </div>
              </div>

              {planOverrideBlockedByStripe && opsPlatformAdmin && (
                <div className="mt-6 rounded-[var(--flux-rad)] border border-[var(--flux-info-alpha-35)] bg-[var(--flux-info-alpha-08)] p-4 space-y-2">
                  <h3 className="font-display font-bold text-sm text-[var(--flux-text)]">{tOrg("planManualBlockedTitle")}</h3>
                  <p className="text-xs text-[var(--flux-text-muted)]">{tOrg("planManualBlockedAdminBody")}</p>
                </div>
              )}

              {planOverrideBlockedByStripe && !opsPlatformAdmin && (
                <div className="mt-6 rounded-[var(--flux-rad)] border border-[var(--flux-info-alpha-35)] bg-[var(--flux-info-alpha-08)] p-4 space-y-2">
                  <h3 className="font-display font-bold text-sm text-[var(--flux-text)]">{tOrg("planManualBlockedUserTitle")}</h3>
                  <p className="text-xs text-[var(--flux-text-muted)]">{tOrg("planManualBlockedUserBody")}</p>
                </div>
              )}

              {canAdminOverridePlan && opsPlatformAdmin && (
                <div className="mt-6 rounded-[var(--flux-rad)] border border-[var(--flux-warning-alpha-35)] bg-[var(--flux-warning-alpha-08)] p-4 space-y-2">
                  <h3 className="font-display font-bold text-sm text-[var(--flux-text)]">{tOrg("planCommercialTitle")}</h3>
                  <p className="text-xs text-[var(--flux-text-muted)]">{tOrg("planCommercialBody")}</p>
                  <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">{tOrg("planSelectLabel")}</label>
                  <select
                    value={orgPlan}
                    onChange={(e) =>
                      setOrgPlan(e.target.value as "free" | "trial" | "pro" | "business")
                    }
                    className="w-full max-w-md px-3 py-2 border border-[var(--flux-chrome-alpha-12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)]"
                    disabled={busy}
                  >
                    <option value="free">{tOrg("planOptionFree")}</option>
                    <option value="trial">{tOrg("planOptionTrial")}</option>
                    <option value="pro">{tOrg("planOptionPro")}</option>
                    <option value="business">{tOrg("planOptionBusiness")}</option>
                  </select>
                </div>
              )}
              </div>

              <div
                role="tabpanel"
                id="org-panel-branding"
                aria-labelledby="org-tab-branding"
                hidden={activeTab !== "branding"}
                className="mt-6 rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]/25 p-4 sm:p-5 motion-safe:transition-opacity motion-safe:duration-200 motion-reduce:transition-none"
              >
              {(orgPlan === "pro" || orgPlan === "business" || orgPlan === "trial") ? (
                <div className="space-y-6">
                  <div>
                    <h3 className="font-display font-bold text-lg text-[var(--flux-text)] mb-1">{tOrg("brandingHeading")}</h3>
                    <p className="text-sm text-[var(--flux-text-muted)]">{tOrg("brandingIntro")}</p>
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
                          {tOrg("uploadLabel")}
                          <input type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" className="hidden" onChange={onLogoFile} disabled={busy} />
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">Cor primária</label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={primaryColor && /^#[0-9a-fA-F]{3,8}$/.test(primaryColor) ? primaryColor : "#" + "6C5CE7"}
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
                          placeholder={"#" + "6C5CE7"}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">Cor secundária</label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={secondaryColor && /^#[0-9a-fA-F]{3,8}$/.test(secondaryColor) ? secondaryColor : "#" + "00D2D3"}
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
                          placeholder={"#" + "00D2D3"}
                        />
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">Cor de destaque (accent)</label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={accentColor && /^#[0-9a-fA-F]{3,8}$/.test(accentColor) ? accentColor : "#" + "FDA7DF"}
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
                          placeholder={"#" + "FDA7DF"}
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
                          {tOrg("uploadLabel")}
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
                          {opsPlatformAdmin ? (
                            <p>
                              <strong className="text-[var(--flux-text)]">SSL:</strong> adicione o hostname no painel Vercel (ou seu provedor) apontando CNAME para{" "}
                              <code className="font-mono text-[var(--flux-text)]">{CNAME_TARGET}</code>.{" "}
                              <a href="https://vercel.com/docs/domains/working-with-domains/add-a-domain" className="underline text-[var(--flux-secondary)]" target="_blank" rel="noreferrer">
                                Documentação Vercel
                              </a>
                            </p>
                          ) : (
                            <p>
                              <strong className="text-[var(--flux-text)]">SSL:</strong> no painel do seu fornecedor de DNS ou alojamento, aponte o hostname com um registo{" "}
                              <strong>CNAME</strong> para{" "}
                              <code className="font-mono text-[var(--flux-text)]">{CNAME_TARGET}</code>. Consulte a documentação do produto ou o suporte se precisar de ajuda com DNS.
                            </p>
                          )}
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
                              {verifyBusy ? tOrg("verifying") : tOrg("verifyTxt")}
                            </button>
                            <button
                              type="button"
                              className="btn-secondary text-xs py-1.5 px-3"
                              disabled={busy || !customDomain.trim()}
                              onClick={() => void save({ regenerateDomainToken: true })}
                            >
                              {tOrg("newToken")}
                            </button>
                          </div>
                          {customDomainVerifiedAt ? (
                            <p className="text-[var(--flux-success)] pt-1">
                              {tOrg("verifiedAt", {
                                date: new Date(customDomainVerifiedAt).toLocaleString(locale === "en" ? "en-US" : "pt-BR"),
                              })}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]/20 p-4">
                  <h3 className="font-display font-bold text-lg text-[var(--flux-text)] mb-1">{tOrg("brandingLockedTitle")}</h3>
                  <p className="text-sm text-[var(--flux-text-muted)]">{tOrg("brandingLockedBody")}</p>
                </div>
              )}
              </div>

              <div
                role="tabpanel"
                id="org-panel-ai"
                aria-labelledby="org-tab-ai"
                hidden={activeTab !== "ai"}
                className="mt-6 rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]/25 p-4 sm:p-5 motion-safe:transition-opacity motion-safe:duration-200 motion-reduce:transition-none"
              >
              <div className="space-y-4">
                <div>
                  <h3 className="font-display font-bold text-lg text-[var(--flux-text)] mb-1">{tOrg("aiHeading")}</h3>
                  <p className="text-sm text-[var(--flux-text-muted)]">{tOrg("aiIntro")}</p>
                </div>
                <div
                  className="rounded-[var(--flux-rad)] border border-[var(--flux-info-alpha-35)] bg-[var(--flux-info-alpha-08)] p-3 text-sm text-[var(--flux-text-muted)] motion-safe:transition-opacity motion-reduce:transition-none"
                  role="note"
                >
                  {tOrg("aiCallout")}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">{tOrg("modelLabel")}</label>
                  <input
                    value={aiTogetherModel}
                    onChange={(e) => setAiTogetherModel(e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--flux-chrome-alpha-12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] font-mono"
                    disabled={busy}
                    placeholder="meta-llama/Llama-3.3-70B-Instruct-Turbo"
                    maxLength={160}
                  />
                  <p className="mt-1 text-xs text-[var(--flux-text-muted)]">{tOrg("modelHelp")}</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">{tOrg("apiKeyLabel")}</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type={showAiKey ? "text" : "password"}
                      value={aiApiKeyInput}
                      onChange={(e) => setAiApiKeyInput(e.target.value)}
                      className="flex-1 min-w-0 px-3 py-2 border border-[var(--flux-chrome-alpha-12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] font-mono"
                      disabled={busy}
                      placeholder={hasOrgApiKey ? "••••••••" : "sk-…"}
                      autoComplete="off"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-secondary text-xs py-1.5 px-3"
                        disabled={busy}
                        onClick={() => setShowAiKey((s) => !s)}
                      >
                        {showAiKey ? tOrg("hideKey") : tOrg("showKey")}
                      </button>
                      {hasOrgApiKey ? (
                        <button type="button" className="btn-secondary text-xs py-1.5 px-3" disabled={busy} onClick={() => setRemoveKeyOpen(true)}>
                          {tOrg("removeKey")}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {hasOrgApiKey && !aiApiKeyInput.trim() ? (
                    <p className="mt-1 text-xs text-[var(--flux-success)]">{tOrg("apiKeyConfigured")}</p>
                  ) : null}
                </div>
                <div>
                  <button
                    type="button"
                    className="text-xs font-semibold text-[var(--flux-primary-light)] underline-offset-2 hover:underline"
                    onClick={() => setAiAdvancedOpen((o) => !o)}
                    aria-expanded={aiAdvancedOpen}
                  >
                    {tOrg("advancedToggle")}
                  </button>
                  {aiAdvancedOpen ? (
                    <div className="mt-2">
                      <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">{tOrg("baseUrlLabel")}</label>
                      <input
                        value={aiBaseUrl}
                        onChange={(e) => setAiBaseUrl(e.target.value)}
                        className="w-full px-3 py-2 border border-[var(--flux-chrome-alpha-12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] font-mono"
                        disabled={busy}
                        placeholder="https://api.example.com/v1"
                      />
                    </div>
                  ) : null}
                </div>
              </div>
              </div>

              <div
                role="tabpanel"
                id="org-panel-billing"
                aria-labelledby="org-tab-billing"
                hidden={activeTab !== "billing"}
                className="mt-6 rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]/25 p-4 sm:p-5 motion-safe:transition-opacity motion-safe:duration-200 motion-reduce:transition-none"
              >
                {user && sessionCanManageMembersAndBilling(user) && stripeCustomerId ? (
                  <>
                    <h3 className="font-display font-bold text-lg text-[var(--flux-text)] mb-1">{tOrg("invoicesTitle")}</h3>
                    <p className="text-sm text-[var(--flux-text-muted)] mb-4">{tOrg("invoicesIntro")}</p>
                    {invoicesLoading ? (
                      <div className="space-y-2 motion-safe:animate-pulse" aria-busy="true">
                        <div className="h-10 rounded-[var(--flux-rad)] bg-[var(--flux-chrome-alpha-12)]" />
                        <div className="h-10 rounded-[var(--flux-rad)] bg-[var(--flux-chrome-alpha-12)]" />
                        <p className="text-sm text-[var(--flux-text-muted)]">{tOrg("invoicesLoading")}</p>
                      </div>
                    ) : invoices.length === 0 ? (
                      <p className="text-sm text-[var(--flux-text-muted)]">{tOrg("invoicesEmpty")}</p>
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
                                  {tOrg("invoiceLink")}
                                </a>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-[var(--flux-text-muted)]">{tOrg("billingEmpty")}</p>
                )}
              </div>

              <div
                role="tabpanel"
                id="org-panel-integrations"
                aria-labelledby="org-tab-integrations"
                hidden={activeTab !== "integrations"}
                className="mt-6 space-y-8 rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]/25 p-4 sm:p-5 motion-safe:transition-opacity motion-safe:duration-200 motion-reduce:transition-none"
              >
                {user && isPlatformAdminSession(user) ? <OrgWebhooksSettings /> : null}
                <PushNotificationsSettings />
              </div>

              {removeKeyOpen ? (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 motion-safe:transition-opacity motion-safe:duration-200"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="remove-key-title"
                >
                  <div className="max-w-md w-full rounded-[var(--flux-rad-xl)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] p-5 shadow-[var(--flux-shadow-elevated-card)]">
                    <h4 id="remove-key-title" className="font-display font-bold text-[var(--flux-text)] mb-2">
                      {tOrg("confirmRemoveTitle")}
                    </h4>
                    <p className="text-sm text-[var(--flux-text-muted)] mb-4">{tOrg("confirmRemoveBody")}</p>
                    <div className="flex justify-end gap-2">
                      <button type="button" className="btn-secondary" disabled={busy} onClick={() => setRemoveKeyOpen(false)}>
                        {tOrg("cancel")}
                      </button>
                      <button type="button" className="btn-primary" disabled={busy} onClick={() => void removeOrgAiKey()}>
                        {tOrg("confirmRemoveAction")}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mt-8 flex flex-col-reverse gap-3 border-t border-[var(--flux-primary-alpha-15)] pt-6 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => router.replace(`${localeRoot}/boards`)}
                >
                  {tOrg("cancel")}
                </button>
                <button type="button" className="btn-primary" disabled={busy} onClick={() => void save()} aria-busy={busy}>
                  {busy ? tOrg("saving") : tOrg("save")}
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
