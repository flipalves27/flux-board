"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { useEffect, useState } from "react";
import { apiGet, ApiError } from "@/lib/api-client";
import type { ForgeJob } from "@/lib/forge-types";

export default function ForgeRunsPage() {
  const locale = useLocale();
  const { getHeaders, isChecked } = useAuth();
  const [runs, setRuns] = useState<ForgeJob[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!isChecked) return;
    void (async () => {
      try {
        const data = await apiGet<{ runs: ForgeJob[] }>("/api/forge/runs", getHeaders());
        setRuns(data.runs ?? []);
      } catch (e) {
        setErr(e instanceof ApiError ? e.message : "error");
      }
    })();
  }, [isChecked, getHeaders]);

  if (err) return <p className="text-sm text-[var(--flux-danger)]">{err}</p>;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl font-bold text-[var(--flux-text)]">Runs</h1>
      <div className="overflow-x-auto rounded-xl border border-[var(--flux-chrome-alpha-10)]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-mid)] text-xs uppercase text-[var(--flux-text-muted)]">
            <tr>
              <th className="p-3">ID</th>
              <th className="p-3">Status</th>
              <th className="p-3">Tier</th>
              <th className="p-3">Repo</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r._id} className="border-b border-[var(--flux-chrome-alpha-06)]">
                <td className="p-3 font-mono text-xs">
                  <Link className="text-[var(--flux-primary-light)] hover:underline" href={`/${locale}/forge/runs/${r._id}`}>
                    {r._id}
                  </Link>
                </td>
                <td className="p-3">{r.status}</td>
                <td className="p-3">{r.tier}</td>
                <td className="p-3 text-[var(--flux-text-muted)]">{r.repoFullName ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
