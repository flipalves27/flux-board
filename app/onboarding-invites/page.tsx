"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { Header } from "@/components/header";
import {
  getOrganizationInvitesOnboardingDoneStorageKey,
  getOnboardingDoneStorageKey,
} from "@/lib/onboarding";

export default function OrganizationInvitesOnboardingPage() {
  const router = useRouter();
  const { user, getHeaders, isChecked } = useAuth();
  const locale = useLocale();
  const t = useTranslations("onboarding");
  const localeRoot = `/${locale}`;

  const invitesDoneKey = useMemo(
    () => (user ? getOrganizationInvitesOnboardingDoneStorageKey(user.id) : null),
    [user]
  );

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  useEffect(() => {
    if (!isChecked || !user) {
      router.replace(`${localeRoot}/login`);
      return;
    }

    // Se não for org-admin, pula.
    if (!user.isAdmin) {
      router.replace(`${localeRoot}/onboarding`);
      return;
    }

    if (invitesDoneKey) {
      try {
        if (localStorage.getItem(invitesDoneKey) === "1") {
          router.replace(`${localeRoot}/onboarding`);
          return;
        }
      } catch {
        // ignore
      }
    }

    setLoading(false);
  }, [isChecked, user, router, localeRoot, invitesDoneKey]);

  async function createInvite() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      if (!email.trim() || !email.includes("@")) throw new Error("Informe um e-mail válido.");

      const data = await apiPost<{ invite: { code: string } }>("/api/organization-invites", { email }, getHeaders());
      const code = (data as any)?.invite?.code;
      if (!code) throw new Error("Convite não gerado.");

      setInviteCode(code);
      const url = `${window.location.origin}${localeRoot}/login?invite=${encodeURIComponent(code)}`;
      setInviteUrl(url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Erro ao criar convite.");
    } finally {
      setBusy(false);
    }
  }

  function markDoneAndContinue() {
    if (invitesDoneKey) {
      try {
        localStorage.setItem(invitesDoneKey, "1");
      } catch {
        // ignore
      }
    }
    router.replace(`${localeRoot}/onboarding`);
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[var(--flux-surface-dark)]">
      <Header title={t("header.title")} backHref={`${localeRoot}/boards`} backLabel={t("header.backLabel")}>
        <div className="text-xs text-[var(--flux-text-muted)]">
          Configure convites para sua equipe.
        </div>
      </Header>

      <main className="max-w-[780px] mx-auto px-6 py-10">
        <div className="rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] p-6 shadow-[var(--flux-shadow-elevated-card)]">
          <h2 className="font-display font-bold text-xl text-[var(--flux-text)] mb-1">Convites</h2>
          <p className="text-sm text-[var(--flux-text-muted)] mb-6">
            Gere um link/código de convite. O convidado usará esse código ao se cadastrar.
          </p>

          {error && (
            <div className="mb-4 bg-[var(--flux-danger-alpha-12)] border border-[var(--flux-danger-alpha-30)] text-[var(--flux-danger)] p-3 rounded-[var(--flux-rad)] text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-end">
            <div>
              <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">E-mail do convidado</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-[var(--flux-chrome-alpha-12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                disabled={busy}
              />
            </div>
            <button className="btn-primary" disabled={busy} type="button" onClick={createInvite}>
              {busy ? "Gerando..." : "Gerar convite"}
            </button>
          </div>

          {inviteUrl && (
            <div className="mt-6 p-4 rounded-[var(--flux-rad)] border border-[var(--flux-secondary-alpha-28)] bg-[var(--flux-secondary-alpha-08)]">
              <p className="text-xs font-semibold text-[var(--flux-text-muted)] uppercase tracking-wide">Link de convite</p>
              <div className="mt-2 flex flex-col gap-2">
                <code className="break-all text-[12px] text-[var(--flux-text)]">{inviteUrl}</code>
                <button
                  className="btn-secondary w-fit"
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(inviteUrl);
                    } catch {
                      // ignore
                    }
                  }}
                >
                  Copiar
                </button>
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <button className="btn-secondary" type="button" disabled={busy} onClick={markDoneAndContinue}>
              Pular (pode convidar depois)
            </button>
            <button className="btn-primary" type="button" disabled={busy} onClick={markDoneAndContinue}>
              Continuar para boards
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

