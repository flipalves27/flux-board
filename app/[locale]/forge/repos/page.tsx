"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api-client";

export default function ForgeReposPage() {
  const locale = useLocale();
  const { getHeaders, isChecked } = useAuth();
  const [meta, setMeta] = useState<{ connected: boolean; installationId: string | null } | null>(null);

  useEffect(() => {
    if (!isChecked) return;
    void (async () => {
      const data = await apiGet<{ connected: boolean; installationId: string | null }>("/api/forge/repos", getHeaders());
      setMeta(data);
    })();
  }, [isChecked, getHeaders]);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl font-bold text-[var(--flux-text)]">Repositories</h1>
      <p className="text-sm text-[var(--flux-text-muted)]">
        GitHub App: {meta?.connected ? "connected" : "not connected"}{" "}
        {meta?.installationId ? <span className="font-mono">({meta.installationId})</span> : null}
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/api/integrations/github/install/start"
          prefetch={false}
          className="rounded-lg bg-[var(--flux-primary)] px-4 py-2 text-sm font-semibold text-white"
        >
          Install GitHub App
        </Link>
        <a
          href={`/${locale}/forge/onboarding`}
          className="rounded-lg border border-[var(--flux-chrome-alpha-12)] px-4 py-2 text-sm font-semibold text-[var(--flux-text)]"
        >
          Onboarding tour
        </a>
      </div>
      <p className="text-xs text-[var(--flux-text-muted)]">
        Template workflow: copy <code className="font-mono">templates/github/flux-forge.yml</code> into{" "}
        <code className="font-mono">.github/workflows/</code> on the customer repo.
      </p>
    </div>
  );
}
