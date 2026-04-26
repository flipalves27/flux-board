"use client";

import { useAuth } from "@/context/auth-context";
import { useEffect, useState } from "react";
import { apiGet, apiPut, ApiError } from "@/lib/api-client";
import type { ForgePolicy } from "@/lib/forge-types";

export default function ForgePoliciesPage() {
  const { getHeaders, isChecked } = useAuth();
  const [policy, setPolicy] = useState<ForgePolicy | null>(null);
  const [lang, setLang] = useState("TypeScript");
  const [approval, setApproval] = useState(false);

  useEffect(() => {
    if (!isChecked) return;
    void (async () => {
      try {
        const data = await apiGet<{ policy: ForgePolicy | null }>("/api/forge/policies", getHeaders());
        const p = data.policy;
        setPolicy(p);
        if (p?.defaultLanguage) setLang(p.defaultLanguage);
        setApproval(Boolean(p?.requireHumanPlanApproval));
      } catch {
        /* ignore */
      }
    })();
  }, [isChecked, getHeaders]);

  const save = async () => {
    try {
      const data = await apiPut<{ policy: ForgePolicy }>(
        "/api/forge/policies",
        { defaultLanguage: lang, requireHumanPlanApproval: approval },
        getHeaders()
      );
      setPolicy(data.policy);
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "save failed");
    }
  };

  return (
    <div className="max-w-lg space-y-4">
      <h1 className="font-display text-xl font-bold text-[var(--flux-text)]">Policies</h1>
      <label className="block text-xs font-semibold text-[var(--flux-text-muted)]">Default language</label>
      <input
        className="w-full rounded-lg border border-[var(--flux-control-border)] bg-[var(--flux-surface-dark)] px-3 py-2 text-sm"
        value={lang}
        onChange={(e) => setLang(e.target.value)}
      />
      <label className="flex items-center gap-2 text-sm text-[var(--flux-text)]">
        <input type="checkbox" checked={approval} onChange={(e) => setApproval(e.target.checked)} />
        Require human plan approval before diff
      </label>
      <button
        type="button"
        onClick={() => void save()}
        className="rounded-lg bg-[var(--flux-primary)] px-4 py-2 text-sm font-semibold text-white"
      >
        Save
      </button>
      {policy ? <pre className="text-[10px] text-[var(--flux-text-muted)]">{JSON.stringify(policy, null, 2)}</pre> : null}
    </div>
  );
}
