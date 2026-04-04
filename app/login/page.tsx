"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { useOrgBranding, usePlatformDisplayName } from "@/context/org-branding-context";
import { loginAction, registerAction } from "@/app/actions/auth";
import { OAuthProviderButtons } from "@/components/auth/oauth-provider-buttons";
import { FluxAppBackdrop } from "@/components/ui/flux-app-backdrop";
import { FluxBrandMark } from "@/components/ui/flux-brand-mark";
import { appendJoinedViaInviteQuery } from "@/lib/invite-join-feedback";

const OAUTH_ERROR_KEYS = new Set([
  "oauth_denied",
  "oauth_invalid",
  "oauth_state",
  "oauth_profile",
  "oauth_exchange",
  "oauth_email_unverified",
  "oauth_no_email",
  "oauth_account_conflict",
  "oauth_invite_invalid",
  "oauth_invite_owner_conflict",
  "oauth_invite_platform_admin",
  "oauth_plan_limit",
  "oauth_consume_failed",
  "oauth_not_configured",
  "rate_limited",
]);

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, login, isChecked } = useAuth();
  const locale = useLocale();
  const t = useTranslations("login");
  const platformName = usePlatformDisplayName();
  const orgBranding = useOrgBranding();
  const logoUrl = orgBranding?.effectiveBranding?.logoUrl?.trim();
  const localeRoot = `/${locale}`;
  const inviteCode = searchParams.get("invite") ?? undefined;
  const redirectTo = searchParams.get("redirect");
  const postLoginPath = redirectTo && redirectTo.startsWith("/") ? redirectTo : `${localeRoot}/boards`;
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [suppressAutoRedirect, setSuppressAutoRedirect] = useState(false);

  useEffect(() => {
    if (inviteCode) setActiveTab("login");
  }, [inviteCode]);

  useEffect(() => {
    const oauthErr = searchParams.get("error");
    if (oauthErr && OAUTH_ERROR_KEYS.has(oauthErr)) {
      const key = `oauth.errors.${oauthErr}` as
        | "oauth.errors.oauth_denied"
        | "oauth.errors.oauth_invalid"
        | "oauth.errors.oauth_state"
        | "oauth.errors.oauth_profile"
        | "oauth.errors.oauth_exchange"
        | "oauth.errors.oauth_email_unverified"
        | "oauth.errors.oauth_no_email"
        | "oauth.errors.oauth_account_conflict"
        | "oauth.errors.oauth_invite_invalid"
        | "oauth.errors.oauth_invite_owner_conflict"
        | "oauth.errors.oauth_invite_platform_admin"
        | "oauth.errors.oauth_plan_limit"
        | "oauth.errors.oauth_consume_failed"
        | "oauth.errors.oauth_not_configured"
        | "oauth.errors.rate_limited";
      setError(t(key));
    }
  }, [searchParams, t]);

  useEffect(() => {
    if (isChecked && user && !suppressAutoRedirect) router.replace(postLoginPath);
  }, [isChecked, user, router, suppressAutoRedirect, postLoginPath]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const userInput = (form.elements.namedItem("user") as HTMLInputElement).value.trim();
    const pwd = (form.elements.namedItem("password") as HTMLInputElement).value;
    const remember = (form.elements.namedItem("remember") as HTMLInputElement)?.checked ?? true;
    if (!userInput || !pwd) {
      setError(t("errors.missingCredentials"));
      return;
    }
    setError("");
    setLoading(true);
    try {
      const result = await loginAction(userInput, pwd, remember, inviteCode);
      if (result.ok) {
        setSuppressAutoRedirect(true);
        login(result.user, remember);
        const next =
          inviteCode?.trim() ? appendJoinedViaInviteQuery(postLoginPath) : postLoginPath;
        router.replace(next);
      } else {
        setError(result.error);
      }
    } catch {
      setError(t("errors.connection"));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const name = (form.elements.namedItem("name") as HTMLInputElement).value.trim();
    const email = (form.elements.namedItem("email") as HTMLInputElement).value.trim();
    const pwd = (form.elements.namedItem("password") as HTMLInputElement).value;
    const remember = (form.elements.namedItem("remember") as HTMLInputElement)?.checked ?? true;
    if (!name || !email || !pwd) {
      setError(t("errors.missingAllFields"));
      return;
    }
    if (pwd.length < 4) {
      setError(t("errors.passwordTooShort"));
      return;
    }
    setError("");
    setLoading(true);
    try {
      const result = await registerAction(name, email, pwd, inviteCode, remember);
      if (result.ok) {
        setSuppressAutoRedirect(true);
        login(result.user, remember);
        const onboardingPath = `${localeRoot}/onboarding`;
        const next =
          inviteCode?.trim() ? appendJoinedViaInviteQuery(onboardingPath) : onboardingPath;
        router.replace(next);
      } else {
        setError(result.error);
      }
    } catch {
      setError(t("errors.connection"));
    } finally {
      setLoading(false);
    }
  };

  const switchTab = (tab: "login" | "register") => {
    setActiveTab(tab);
    setError("");
  };

  if (!isChecked) {
    return (
      <div className="auth-public-shell relative flex min-h-[100dvh] items-center justify-center overflow-x-hidden bg-[var(--flux-surface-dark)]">
        <FluxAppBackdrop variant="immersive" />
        <p className="relative z-[1] text-[var(--flux-text-muted)]">{t("loading")}</p>
      </div>
    );
  }

  const inputClass =
    "flux-input min-h-10 w-full rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm text-[var(--flux-text)] placeholder-[var(--flux-text-muted)]";
  const labelClass =
    "block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 uppercase tracking-wide font-display";
  const submitClass = "flux-marketing-btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className="auth-public-shell relative flex min-h-[100dvh] items-center justify-center overflow-x-hidden bg-[var(--flux-surface-dark)] pl-[max(1.25rem,env(safe-area-inset-left,0px))] pr-[max(1.25rem,env(safe-area-inset-right,0px))] pt-[max(1.5rem,env(safe-area-inset-top,0px))] pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
      <FluxAppBackdrop variant="immersive" />
      <div className="flux-glass-card auth-glass-panel relative z-[1] w-full max-w-[400px] p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <FluxBrandMark platformName={platformName} logoUrl={logoUrl} variant="auth" className="flex-shrink-0" />
          <div>
            <h1 className="font-display font-bold text-xl text-[var(--flux-text)] tracking-tight">
              {platformName}
            </h1>
            <p className="text-xs text-[var(--flux-text-muted)] font-medium tracking-wide mt-0.5">
              {t("subtitle")}
            </p>
          </div>
        </div>

        <div className="flux-marketing-segmented mb-6 w-full">
          <button
            type="button"
            onClick={() => switchTab("login")}
            className={`flux-marketing-segmented__btn ${activeTab === "login" ? "flux-marketing-segmented__btn--active" : ""}`}
          >
            {t("tabs.login")}
          </button>
          <button
            type="button"
            onClick={() => switchTab("register")}
            className={`flux-marketing-segmented__btn ${activeTab === "register" ? "flux-marketing-segmented__btn--active" : ""}`}
          >
            {t("tabs.register")}
          </button>
        </div>

        {error && (
          <div className="bg-[var(--flux-danger-alpha-12)] border border-[var(--flux-danger-alpha-30)] text-[var(--flux-danger)] p-3 rounded-[var(--flux-rad)] text-sm mb-4">
            {error}
          </div>
        )}

        {inviteCode && (
          <div className="border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)] p-3 rounded-[var(--flux-rad)] text-sm mb-4">
            {t("inviteBanner")}
          </div>
        )}

        <OAuthProviderButtons
          locale={locale}
          invite={inviteCode}
          redirect={redirectTo && redirectTo.startsWith("/") ? redirectTo : undefined}
        />

        {activeTab === "login" && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className={labelClass}>{t("fields.userOrEmail")}</label>
              <input
                name="user"
                type="text"
                placeholder={t("placeholders.userOrEmail")}
                autoComplete="username"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t("fields.password")}</label>
              <input
                name="password"
                type="password"
                placeholder={t("placeholders.password")}
                autoComplete="current-password"
                className={inputClass}
              />
            </div>
            <label className="flex items-center gap-2 mb-4 cursor-pointer">
              <input name="remember" type="checkbox" defaultChecked className="w-4 h-4 accent-[var(--flux-primary)]" />
              <span className="text-sm text-[var(--flux-text-muted)]">{t("remember.login")}</span>
            </label>
            <button type="submit" disabled={loading} className={submitClass}>
              {t("actions.login")}
            </button>
          </form>
        )}

        {activeTab === "register" && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className={labelClass}>{t("fields.name")}</label>
              <input
                name="name"
                type="text"
                placeholder={t("placeholders.name")}
                autoComplete="name"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t("fields.email")}</label>
              <input
                name="email"
                type="email"
                placeholder={t("placeholders.email")}
                autoComplete="email"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t("fields.password")}</label>
              <input
                name="password"
                type="password"
                placeholder={t("placeholders.passwordMin")}
                autoComplete="new-password"
                className={inputClass}
              />
            </div>
            <label className="flex items-center gap-2 mb-4 cursor-pointer">
              <input name="remember" type="checkbox" defaultChecked className="w-4 h-4 accent-[var(--flux-primary)]" />
              <span className="text-sm text-[var(--flux-text-muted)]">{t("remember.register")}</span>
            </label>
            <button type="submit" disabled={loading} className={submitClass}>
              {t("actions.register")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
