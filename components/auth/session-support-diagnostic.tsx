"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { buildFluxSessionDiagnosticPayload } from "@/lib/session-support-diagnostic";

type Props = {
  supportRef: string;
  failureKind: string;
};

export function SessionSupportDiagnostic({ supportRef, failureKind }: Props) {
  const t = useTranslations("login.sessionDiag");
  const [copied, setCopied] = useState(false);

  const payloadText = useMemo(
    () => JSON.stringify(buildFluxSessionDiagnosticPayload(supportRef, failureKind, typeof window !== "undefined" ? window : undefined), null, 2),
    [supportRef, failureKind]
  );

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(payloadText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }, [payloadText]);

  const kindDescription = (() => {
    switch (failureKind) {
      case "no_cookies":
        return t("kinds.no_cookies");
      case "token_invalid":
        return t("kinds.token_invalid");
      case "user_not_found":
        return t("kinds.user_not_found");
      case "client_timeout":
        return t("kinds.client_timeout");
      case "server_timeout":
        return t("kinds.server_timeout");
      default:
        return t("kinds.unknown");
    }
  })();

  return (
    <div className="border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] rounded-[var(--flux-rad)] p-3 mb-4 text-left space-y-2">
      <p className="text-xs font-semibold text-[var(--flux-text)]">{t("title")}</p>
      <p className="text-[11px] text-[var(--flux-text-muted)] leading-snug">{t("hint")}</p>
      <p className="text-[11px] text-[var(--flux-text-muted)]">
        <span className="font-medium text-[var(--flux-text)]">{t("kindLabel")}</span> {kindDescription}
      </p>
      <div className="rounded-md bg-[var(--flux-chrome-alpha-08)] px-2 py-1.5 font-mono text-[10px] text-[var(--flux-text)] break-all">
        {supportRef}
      </div>
      <button
        type="button"
        onClick={() => void copy()}
        className="flux-marketing-btn-secondary w-full justify-center text-xs py-2 min-h-9"
      >
        {copied ? t("copied") : t("copyJson")}
      </button>
    </div>
  );
}
