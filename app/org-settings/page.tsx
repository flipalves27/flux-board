"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { apiGet, apiPut, ApiError } from "@/lib/api-client";
import { Header } from "@/components/header";
import { useToast } from "@/context/toast-context";
import { useOrgBranding } from "@/context/org-branding-context";

function slugifyLocal(input: string): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

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
  const [error, setError] = useState<string | null>(null);

  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [orgPlan, setOrgPlan] = useState<"free" | "pro" | "business">("free");
  const [slugTouched, setSlugTouched] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("");
  const [secondaryColor, setSecondaryColor] = useState("");
  const [faviconUrl, setFaviconUrl] = useState("");
  const [customDomain, setCustomDomain] = useState("");

  const suggestedSlug = useMemo(() => slugifyLocal(orgName), [orgName]);

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
        const data = await apiGet<{ organization: any }>("/api/organizations/me", getHeaders());
        const org = data?.organization;
        setOrgName(org?.name ?? "");
        setOrgSlug(org?.slug ?? "");
        setOrgPlan(org?.plan === "pro" || org?.plan === "business" ? org.plan : "free");
        const b = org?.branding;
        setLogoUrl(typeof b?.logoUrl === "string" ? b.logoUrl : "");
        setPrimaryColor(typeof b?.primaryColor === "string" ? b.primaryColor : "");
        setSecondaryColor(typeof b?.secondaryColor === "string" ? b.secondaryColor : "");
        setFaviconUrl(typeof b?.faviconUrl === "string" ? b.faviconUrl : "");
        setCustomDomain(typeof b?.customDomain === "string" ? b.customDomain : "");
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
    if (!slugTouched) setOrgSlug(suggestedSlug);
  }, [suggestedSlug, slugTouched]);

  async function save() {
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
              faviconUrl: faviconUrl.trim() || "",
              ...(orgPlan === "business" ? { customDomain: customDomain.trim() || "" } : {}),
            }
          : undefined;

      await apiPut(
        "/api/organizations/me",
        branding
          ? { name, slug, branding }
          : { name, slug },
        getHeaders()
      );
      pushToast({ kind: "success", title: "Organização atualizada." });
      setSlugTouched(true);
      await orgBranding?.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--flux-surface-dark)]">
      <Header title={tNav("organization")} backHref={`${localeRoot}/boards`} backLabel="← Boards">
        <div className="text-xs text-[var(--flux-text-muted)]">{t("steps.pill1")}</div>
      </Header>
      <main className="max-w-[780px] mx-auto px-6 py-10">
        <div className="rounded-[var(--flux-rad-xl)] border border-[rgba(108,92,231,0.2)] bg-[var(--flux-surface-card)] p-6 shadow-[0_10px_30px_rgba(0,0,0,0.2)]">
          <h2 className="font-display font-bold text-xl text-[var(--flux-text)] mb-1">Configuração da Organização</h2>
          <p className="text-sm text-[var(--flux-text-muted)] mb-6">
            O `slug` é usado para URLs/escopo do tenant. Ele precisa ser único.
          </p>

          {loading ? (
            <p className="text-[var(--flux-text-muted)]">Carregando...</p>
          ) : (
            <>
              {error && (
                <div className="mb-4 bg-[rgba(255,107,107,0.12)] border border-[rgba(255,107,107,0.3)] text-[var(--flux-danger)] p-3 rounded-[var(--flux-rad)] text-sm">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">Nome</label>
                  <input
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    className="w-full px-3 py-2 border border-[rgba(255,255,255,0.12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
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
                    className="w-full px-3 py-2 border border-[rgba(255,255,255,0.12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)] font-mono"
                    disabled={busy}
                  />
                  <p className="mt-2 text-xs text-[var(--flux-text-muted)]">
                    Sugestão: <code className="font-mono">{suggestedSlug || "—"}</code>
                  </p>
                </div>
              </div>

              {(orgPlan === "pro" || orgPlan === "business") && (
                <div className="mt-8 pt-8 border-t border-[rgba(108,92,231,0.15)]">
                  <h3 className="font-display font-bold text-lg text-[var(--flux-text)] mb-1">Branding (app inteiro)</h3>
                  <p className="text-sm text-[var(--flux-text-muted)] mb-4">
                    Logo na sidebar, cores primárias e favicon. Plano Business: domínio customizado (CNAME configurado no DNS).
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">Logo (URL)</label>
                      <input
                        value={logoUrl}
                        onChange={(e) => setLogoUrl(e.target.value)}
                        className="w-full px-3 py-2 border border-[rgba(255,255,255,0.12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)]"
                        disabled={busy}
                        placeholder="https://…"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">Cor primária (hex)</label>
                      <input
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="w-full px-3 py-2 border border-[rgba(255,255,255,0.12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] font-mono"
                        disabled={busy}
                        placeholder="#6C5CE7"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">Cor secundária (hex)</label>
                      <input
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        className="w-full px-3 py-2 border border-[rgba(255,255,255,0.12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] font-mono"
                        disabled={busy}
                        placeholder="#00D2D3"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">Favicon (URL)</label>
                      <input
                        value={faviconUrl}
                        onChange={(e) => setFaviconUrl(e.target.value)}
                        className="w-full px-3 py-2 border border-[rgba(255,255,255,0.12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)]"
                        disabled={busy}
                        placeholder="https://…/favicon.ico"
                      />
                    </div>
                    {orgPlan === "business" && (
                      <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">Domínio customizado</label>
                        <input
                          value={customDomain}
                          onChange={(e) => setCustomDomain(e.target.value)}
                          className="w-full px-3 py-2 border border-[rgba(255,255,255,0.12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] font-mono"
                          disabled={busy}
                          placeholder="board.cliente.com"
                        />
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
                <button type="button" className="btn-primary" disabled={busy} onClick={save}>
                  {busy ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

