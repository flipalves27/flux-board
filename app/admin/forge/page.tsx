"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { apiGet, ApiError } from "@/lib/api-client";
import { isPlatformAdminSession } from "@/lib/rbac";
import { useRouter } from "next/navigation";

export default function AdminForgePage() {
  const { user, getHeaders, isChecked } = useAuth();
  const router = useRouter();
  const locale = useLocale();
  const [stats, setStats] = useState<{ orgCount: number; jobCount: number; totalUsd: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !isPlatformAdminSession(user)) return;
    try {
      const data = await apiGet<{ stats: typeof stats }>("/api/admin/forge", getHeaders());
      setStats(data.stats ?? null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "error");
    }
  }, [getHeaders, user]);

  useEffect(() => {
    if (!isChecked) return;
    if (!user || !isPlatformAdminSession(user)) {
      router.replace(`/${locale}/boards`);
      return;
    }
    void load();
  }, [isChecked, user, load, router, locale]);

  if (!isChecked || !user || !isPlatformAdminSession(user)) return null;
  if (err) return <p className="p-6 text-red-500">{err}</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 text-[var(--flux-text)]">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold">Flux Forge — platform</h1>
        <Link href={`/${locale}/admin/platform`} className="text-sm font-semibold text-[var(--flux-primary-light)]">
          ← Admin
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--flux-border-default)] bg-[var(--flux-surface-card)] p-4">
          <p className="text-xs text-[var(--flux-text-muted)]">Orgs with jobs</p>
          <p className="mt-1 text-2xl font-bold">{stats?.orgCount ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-[var(--flux-border-default)] bg-[var(--flux-surface-card)] p-4">
          <p className="text-xs text-[var(--flux-text-muted)]">Total jobs</p>
          <p className="mt-1 text-2xl font-bold">{stats?.jobCount ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-[var(--flux-border-default)] bg-[var(--flux-surface-card)] p-4">
          <p className="text-xs text-[var(--flux-text-muted)]">Tracked USD</p>
          <p className="mt-1 text-2xl font-bold">{stats != null ? `$${stats.totalUsd.toFixed(2)}` : "—"}</p>
        </div>
      </div>
      <p className="text-xs text-[var(--flux-text-muted)]">
        Fine quotas and billing breakdown hook into plan gates (`forge_*` features) and `usage.usd` on each job.
      </p>
    </div>
  );
}
