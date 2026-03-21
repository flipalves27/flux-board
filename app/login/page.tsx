"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { loginAction, registerAction } from "@/app/actions/auth";

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
  const localeRoot = `/${locale}`;
  const inviteCode = searchParams.get("invite") ?? undefined;
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [suppressAutoRedirect, setSuppressAutoRedirect] = useState(false);

  useEffect(() => {
    if (isChecked && user && !suppressAutoRedirect) router.replace(`${localeRoot}/boards`);
  }, [isChecked, user, router, suppressAutoRedirect]);

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
      const result = await loginAction(userInput, pwd);
      if (result.ok) {
        setSuppressAutoRedirect(true);
        login(result.token, result.user, remember);
        router.replace(`${localeRoot}/boards`);
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
      const result = await registerAction(name, email, pwd, inviteCode);
      if (result.ok) {
        setSuppressAutoRedirect(true);
        login(result.token, result.user, remember);
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
      <div className="min-h-screen flex items-center justify-center bg-[var(--flux-surface-dark)]">
        <p className="text-[var(--flux-text-muted)]">{t("loading")}</p>
      </div>
    );
  }

  const inputClass =
    "w-full px-3 py-2.5 rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] focus:border-[var(--flux-primary)] outline-none transition-colors";
  const labelClass =
    "block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 uppercase tracking-wide font-display";
  const btnClass =
    "w-full py-2.5 rounded-[var(--flux-rad)] font-semibold bg-[var(--flux-primary)] text-white hover:bg-[var(--flux-primary-light)] disabled:opacity-60 disabled:cursor-not-allowed transition-all font-display";

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--flux-surface-dark)]">
      <div className="bg-[var(--flux-surface-card)] border border-[var(--flux-primary-alpha-20)] rounded-[var(--flux-rad-xl)] shadow-[var(--flux-shadow-login-panel)] w-full max-w-[400px] p-8">
        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0"
            style={{
              background: "linear-gradient(135deg, var(--flux-primary), var(--flux-primary-dark))",
              boxShadow: "0 8px 32px var(--flux-primary-alpha-40)",
            }}
          >
            <FluxLogoIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-display font-bold text-xl text-[var(--flux-text)] tracking-tight">
              Flux-Board
            </h1>
            <p className="text-xs text-[var(--flux-text-muted)] font-medium tracking-wide mt-0.5">
              {t("subtitle")}
            </p>
          </div>
        </div>

        <div className="flex gap-1 mb-6 bg-[var(--flux-surface-elevated)] rounded-[var(--flux-rad)] p-1">
          <button
            type="button"
            onClick={() => switchTab("login")}
            className={`flex-1 py-2 rounded-[var(--flux-rad-sm)] font-semibold text-sm transition-all font-display ${
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
            className={`flex-1 py-2 rounded-[var(--flux-rad-sm)] font-semibold text-sm transition-all font-display ${
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
