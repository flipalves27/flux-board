"use client";

import { useAuth } from "@/context/auth-context";
import { useEffect, useState } from "react";
import { apiGet, ApiError } from "@/lib/api-client";
import type { ForgeInsightsSnapshot } from "@/lib/forge-types";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function ForgeInsightsPage() {
  const { getHeaders, isChecked } = useAuth();
  const [insights, setInsights] = useState<ForgeInsightsSnapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!isChecked) return;
    void (async () => {
      try {
        const data = await apiGet<{ insights: ForgeInsightsSnapshot }>("/api/forge/insights", getHeaders());
        setInsights(data.insights);
      } catch (e) {
        setErr(e instanceof ApiError ? e.message : "error");
      }
    })();
  }, [isChecked, getHeaders]);

  if (err) return <p className="text-sm text-[var(--flux-danger)]">{err}</p>;
  if (!insights) return <div className="h-40 animate-pulse rounded-xl bg-[var(--flux-chrome-alpha-08)]" />;

  const heat = Object.entries(insights.byRepo).map(([repo, v]) => ({
    repo,
    runs: v.runs,
    rate: v.runs ? Math.round((v.merged / v.runs) * 100) : 0,
  }));

  return (
    <div className="space-y-8">
      <h1 className="font-display text-xl font-bold text-[var(--flux-text)]">Insights</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--flux-chrome-alpha-10)] p-4">
          <p className="text-xs text-[var(--flux-text-muted)]">Total runs</p>
          <p className="font-display text-2xl font-bold text-[var(--flux-text)]">{insights.totalRuns}</p>
        </div>
        <div className="rounded-xl border border-[var(--flux-chrome-alpha-10)] p-4">
          <p className="text-xs text-[var(--flux-text-muted)]">Merged</p>
          <p className="font-display text-2xl font-bold text-[var(--flux-success)]">{insights.mergedRuns}</p>
        </div>
        <div className="rounded-xl border border-[var(--flux-chrome-alpha-10)] p-4">
          <p className="text-xs text-[var(--flux-text-muted)]">Est. spend</p>
          <p className="font-display text-2xl font-bold text-[var(--flux-text)]">${insights.totalUsd.toFixed(2)}</p>
        </div>
      </div>
      <div className="h-72 rounded-xl border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-mid)]/50 p-4">
        <p className="mb-2 text-xs font-semibold text-[var(--flux-text-muted)]">Runs by repo (merge rate %)</p>
        <ResponsiveContainer width="100%" height="90%">
          <BarChart data={heat}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="repo" tick={{ fill: "var(--flux-text-muted)", fontSize: 10 }} />
            <YAxis tick={{ fill: "var(--flux-text-muted)", fontSize: 10 }} />
            <Tooltip
              contentStyle={{
                background: "var(--flux-surface-card)",
                border: "1px solid var(--flux-border-default)",
              }}
            />
            <Bar dataKey="runs" fill="var(--flux-primary)" name="runs" />
            <Bar dataKey="rate" fill="var(--flux-success)" name="merge %" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
