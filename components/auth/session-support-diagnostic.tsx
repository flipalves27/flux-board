"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { buildFluxSessionDiagnosticPayload } from "@/lib/session-support-diagnostic";

type Props = {
  supportRef: string;
  failureKind: string;
};

/**
 * Botão que copia JSON de diagnóstico (inclui `fluxSessionSupportRef`) sem mostrar o ID na UI.
 */
export function SessionFailureCopyJsonButton({ supportRef, failureKind }: Props) {
  const t = useTranslations("login.sessionDiag");
  const [copied, setCopied] = useState(false);

  const payloadText = useMemo(
    () =>
      JSON.stringify(
        buildFluxSessionDiagnosticPayload(supportRef, failureKind, typeof window !== "undefined" ? window : undefined),
        null,
        2
      ),
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

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="flux-marketing-btn-secondary w-full justify-center text-xs py-2 min-h-9"
    >
      {copied ? t("copied") : t("copyJson")}
    </button>
  );
}
