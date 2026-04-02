"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { useOrgBranding, usePlatformDisplayName } from "@/context/org-branding-context";
import { loginAction, registerAction } from "@/app/actions/auth";
import { OAuthProviderButtons } from "@/components/auth/oauth-provider-buttons";

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
  "oauth_plan_limit",
  "oauth_consume_failed",
  "oauth_not_configured",
  "rate_limited",
]);

function FluxLogoIcon({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 44 44" fill="none" className={className} aria-hidden>
      <path d="M8 32L16 20L24 26L36 10" stroke="var(--flux-text)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M30 10H36V16" stroke="var(--flux-text)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="20" r="2.5" fill="var(--flux-accent-alpha-80)" />
      <circle cx="24" cy="26" r="2.5" fill="var(--flux-secondary-alpha-80)" />
      <path d="M8 36H36" stroke="var(--flux-chrome-alpha-30)" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

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
      const result = await loginAction(userInput, pwd, remember);
      if (result.ok) {
        setSuppressAutoRedirect(true);
        login(result.user, remember);
        router.replace(postLoginPath);
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
        router.replace(`${localeRoot}/onboarding`);
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
      <div className="relative flex min-h-[100dvh] items-center justify-center overflow-x-hidden bg-[var(--flux-surface-dark)]">
        <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
          <div className="flux-aurora-bg flux-aurora-bg--subtle absolute inset-0">
            <span className="flux-aurora-blob flux-aurora-blob--a" />
            <span className="flux-aurora-blob flux-aurora-blob--b" />
            <span className="flux-aurora-blob flux-aurora-blob--c" />
          </div>
          <div className="flux-grid-overlay absolute inset-0 opacity-[0.26]" />
        </div>
        <p className="relative z-[1] text-[var(--flux-text-muted)]">{t("loading")}</p>
      </div>
    );
  }

  const inputClass =
    "flux-input min-h-11 w-full rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2.5 text-[var(--flux-text)] placeholder-[var(--flux-text-muted)]";
  const labelClass =
    "block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 uppercase tracking-wide font-display";
  const btnClass =
    "min-h-11 w-full rounded-[var(--flux-rad)] bg-[var(--flux-primary)] py-2.5 font-display font-semibold text-white transition-all hover:bg-[var(--flux-primary-light)] disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-x-hidden bg-[var(--flux-surface-dark)] pl-[max(1.25rem,env(safe-area-inset-left,0px))] pr-[max(1.25rem,env(safe-area-inset-right,0px))] pt-[max(1.5rem,env(safe-area-inset-top,0px))] pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
        <div className="flux-aurora-bg flux-aurora-bg--subtle absolute inset-0">
          <span className="flux-aurora-blob flux-aurora-blob--a" />
          <span className="flux-aurora-blob flux-aurora-blob--b" />
          <span className="flux-aurora-blob flux-aurora-blob--c" />
        </div>
        <div className="flux-grid-overlay absolute inset-0 opacity-[0.26]" />
      </div>
      <div className="flux-glass-card relative z-[1] w-full max-w-[400px] p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0 overflow-hidden"
            style={{
              background: logoUrl
                ? "var(--flux-surface-elevated)"
                : "linear-gradient(135deg, var(--flux-primary), var(--flux-primary-dark))",
              boxShadow: logoUrl ? "none" : "0 8px 32px var(--flux-primary-alpha-40)",
            }}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="max-h-8 max-w-[36px] object-contain" />
            ) : (
              <FluxLogoIcon className="w-5 h-5" />
            )}
          </div>
          <div>
            <h1 className="font-display font-bold text-xl text-[var(--flux-text)] tracking-tight">
              {platformName}
            </h1>
            <p className="text-xs text-[var(--flux-text-muted)] font-medium tracking-wide mt-0.5">
              {t("subtitle")}
            </p>
          </div>
        </div>

        <div className="mb-6 flex gap-1 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] p-1">
          <button
            type="button"
            onClick={() => switchTab("login")}
            className={`min-h-11 flex-1 rounded-[var(--flux-rad-sm)] py-2 font-display text-sm font-semibold transition-all ${
              activeTab === "login"
                ? "bg-[var(--flux-primary)] text-white shadow-sm"
                : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
            }`}
          >
            {t("tabs.login")}
          </button>
          <button
            type="button"
            onClick={() => switchTab("register")}
            className={`min-h-11 flex-1 rounded-[var(--flux-rad-sm)] py-2 font-display text-sm font-semibold transition-all ${
              activeTab === "register"
                ? "bg-[var(--flux-primary)] text-white shadow-sm"
                : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
            }`}
          >
            {t("tabs.register")}
          </button>
        </div>

        {error && (
          <div className="bg-[var(--flux-danger-alpha-12)] border border-[var(--flux-danger-alpha-30)] text-[var(--flux-danger)] p-3 rounded-[var(--flux-rad)] text-sm mb-4">
            {error}
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
            <button type="submit" disabled={loading} className={btnClass}>
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
            <button type="submit" disabled={loading} className={btnClass}>
              {t("actions.register")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
