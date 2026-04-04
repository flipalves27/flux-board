"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { GoogleIcon } from "./google-icon";
import { MicrosoftIcon } from "./microsoft-icon";

type Props = {
  locale: string;
  invite?: string;
  redirect?: string;
};

function buildStartUrl(
  basePath: "/api/auth/oauth/google/start" | "/api/auth/oauth/microsoft/start",
  locale: string,
  invite?: string,
  redirect?: string
): string {
  const q = new URLSearchParams();
  q.set("locale", locale);
  if (invite) q.set("invite", invite);
  if (redirect) q.set("redirect", redirect);
  const s = q.toString();
  return s ? `${basePath}?${s}` : basePath;
}

export function OAuthProviderButtons({ locale, invite, redirect }: Props) {
  const t = useTranslations("login.oauth");
  const [loading, setLoading] = useState<null | "google" | "microsoft">(null);

  const showGoogle = useMemo(() => {
    const v = process.env.NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED?.toLowerCase();
    return v === "1" || v === "true" || v === "yes";
  }, []);

  const showMicrosoft = useMemo(() => {
    const v = process.env.NEXT_PUBLIC_OAUTH_MICROSOFT_ENABLED?.toLowerCase();
    return v === "1" || v === "true" || v === "yes";
  }, []);

  const googleHref = useMemo(
    () => buildStartUrl("/api/auth/oauth/google/start", locale, invite, redirect),
    [locale, invite, redirect]
  );
  const microsoftHref = useMemo(
    () => buildStartUrl("/api/auth/oauth/microsoft/start", locale, invite, redirect),
    [locale, invite, redirect]
  );

  if (!showGoogle && !showMicrosoft) {
    return null;
  }

  const btnClass =
    "flex w-full items-center justify-center gap-2.5 min-h-10 rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-[0.8125rem] font-semibold text-[var(--flux-text)] transition-colors duration-150 hover:bg-[var(--flux-chrome-alpha-12)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--flux-primary)] disabled:pointer-events-none disabled:opacity-50 font-display";

  return (
    <div className="space-y-3">
      {showGoogle && (
        <a
          href={googleHref}
          className={`${btnClass} ${loading && loading !== "google" ? "pointer-events-none opacity-50" : ""}`}
          aria-busy={loading === "google"}
          aria-label={t("ariaGoogle")}
          onClick={() => setLoading("google")}
        >
          <GoogleIcon className="h-5 w-5 shrink-0" />
          <span>{loading === "google" ? t("redirecting") : t("continueGoogle")}</span>
        </a>
      )}
      {showMicrosoft && (
        <a
          href={microsoftHref}
          className={`${btnClass} ${loading && loading !== "microsoft" ? "pointer-events-none opacity-50" : ""}`}
          aria-busy={loading === "microsoft"}
          aria-label={t("ariaMicrosoft")}
          onClick={() => setLoading("microsoft")}
        >
          <MicrosoftIcon className="h-5 w-5 shrink-0" />
          <span>{loading === "microsoft" ? t("redirecting") : t("continueMicrosoft")}</span>
        </a>
      )}
      <div className="relative py-2">
        <div className="absolute inset-0 flex items-center" aria-hidden>
          <div className="w-full border-t border-[var(--flux-chrome-alpha-12)]" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-[var(--flux-surface-card)] px-3 text-[var(--flux-text-muted)] font-medium uppercase tracking-wide">
            {t("divider")}
          </span>
        </div>
      </div>
    </div>
  );
}
