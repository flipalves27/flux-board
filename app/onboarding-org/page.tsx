"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { apiGet, apiPut, ApiError } from "@/lib/api-client";
import { Header } from "@/components/header";
import {
  getOrganizationInvitesOnboardingDoneStorageKey,
  getOrganizationOnboardingDoneStorageKey,
} from "@/lib/onboarding";

export default function OrganizationOnboardingPage() {
  const router = useRouter();
  const { user, getHeaders, isChecked } = useAuth();
  const locale = useLocale();
  const t = useTranslations("onboarding");
  const localeRoot = `/${locale}`;

  const orgDoneKey = useMemo(() => (user ? getOrganizationOnboardingDoneStorageKey(user.id) : null), [user]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");

  useEffect(() => {
    if (!isChecked || !user) {
      router.replace(`${localeRoot}/login`);
      return;
    }

    // Se não for org-admin, pula as etapas de org/invites.
    if (!user.isAdmin) {
      try {
        localStorage.setItem(getOrganizationOnboardingDoneStorageKey(user.id), "1");
        localStorage.setItem(getOrganizationInvitesOnboardingDoneStorageKey(user.id), "1");
      } catch {
        // ignore
      }
      router.replace(`${localeRoot}/onboarding`);
      return;
    }

    // Se org já foi configurada, segue para convites.
    if (orgDoneKey) {
      try {
        const done = localStorage.getItem(orgDoneKey);
        if (done === "1") {
          router.replace(`${localeRoot}/onboarding-invites`);
          return;
        }
      } catch {
        // ignore
      }
    }

    setLoading(true);
    (async () => {
      try {
        setError(null);
        const data = await apiGet<{ organization: any }>("/api/organizations/me", getHeaders());
        const org = data?.organization;
        setOrgName(org?.name ?? "");
        setOrgSlug(org?.slug ?? "");
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          router.replace(`${localeRoot}/boards`);
          return;
        }
        setError(e instanceof ApiError ? e.message : "Erro ao carregar organização.");
      } finally {
        setLoading(false);
      }
    })();
  }, [isChecked, user, router, localeRoot, orgDoneKey, getHeaders]);

  async function saveOrg() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      if (!orgName.trim()) throw new Error("Nome da organização é obrigatório.");
      if (!orgSlug.trim()) throw new Error("Slug da organização é obrigatório.");

      await apiPut("/api/organizations/me", { name: orgName, slug: orgSlug }, getHeaders());
      if (orgDoneKey) localStorage.setItem(orgDoneKey, "1");
      router.replace(`${localeRoot}/onboarding-invites`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[var(--flux-surface-dark)]">
      <Header title={t("header.title")} backHref={`${localeRoot}/boards`} backLabel={t("header.backLabel")}>
        <div className="text-xs text-[var(--flux-text-muted)]">
          {t("steps.pill1")} / {t("steps.pill2")} / {t("steps.pill3")}
        </div>
      </Header>

      <main className="max-w-[780px] mx-auto px-6 py-10">
        <div className="rounded-[var(--flux-rad-xl)] border border-[rgba(108,92,231,0.2)] bg-[var(--flux-surface-card)] p-6 shadow-[0_10px_30px_rgba(0,0,0,0.2)]">
          <h2 className="font-display font-bold text-xl text-[var(--flux-text)] mb-1">Organização</h2>
          <p className="text-sm text-[var(--flux-text-muted)] mb-6">
            Configure o nome e o slug para separar sua área de boards.
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
                    onChange={(e) => setOrgSlug(e.target.value)}
                    className="w-full px-3 py-2 border border-[rgba(255,255,255,0.12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)] font-mono"
                    disabled={busy}
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => {
                    // Se quiser pular, marca como feito mesmo sem salvar.
                    if (orgDoneKey) localStorage.setItem(orgDoneKey, "1");
                    router.replace(`${localeRoot}/onboarding-invites`);
                  }}
                >
                  Pular
                </button>
                <button type="button" className="btn-primary" disabled={busy} onClick={saveOrg}>
                  {busy ? "Salvando..." : "Continuar"}
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

