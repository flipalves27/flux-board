"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { Header } from "@/components/header";
import { apiGet, ApiError } from "@/lib/api-client";
import { isPlatformAdminSession } from "@/lib/rbac";

type AbuseRow = {
  identifier: string;
  category: string;
  hits: number;
  lastAt: string;
  lastPath: string;
  sampleIp: string | null;
  sampleUserId: string | null;
};

export default function RateLimitAbusePage() {
  const t = useTranslations("rateLimitAbuse");
  const router = useRouter();
  const { user, getHeaders, isChecked } = useAuth();
  const [rows, setRows] = useState<AbuseRow[]>([]);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isChecked || !user) {
      router.replace("/login");
      return;
    }
    if (!isPlatformAdminSession(user)) {
      router.replace("/boards");
      return;
    }
    void load();
  }, [isChecked, user, router, days]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await apiGet<{ rows: AbuseRow[]; days: number }>(
        `/api/admin/rate-limit-abuse?days=${days}`,
        getHeaders()
      );
      setRows(data.rows ?? []);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 401) router.replace("/login");
        else if (e.status === 403) router.replace("/boards");
        else setError(e.message || t("loadError"));
      } else setError(t("loadError"));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  if (!isChecked || !user || !isPlatformAdminSession(user)) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header title={t("title")} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <p className="mb-6 text-sm text-[var(--flux-muted)]">{t("subtitle")}</p>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span>{t("period")}</span>
            <select
              className="rounded-md border border-[var(--flux-border)] bg-[var(--flux-surface)] px-2 py-1 text-sm"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              <option value={1}>1 {t("days")}</option>
              <option value={7}>7 {t("days")}</option>
              <option value={14}>14 {t("days")}</option>
              <option value={30}>30 {t("days")}</option>
            </select>
          </label>
          <button
            type="button"
            className="rounded-md bg-[var(--flux-accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            onClick={() => void load()}
          >
            {t("refresh")}
          </button>
        </div>

        {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

        {loading ? (
          <p className="text-sm text-[var(--flux-muted)]">{t("loading")}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[var(--flux-muted)]">{t("empty")}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[var(--flux-border)]">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--flux-border)] bg-[var(--flux-surface-2)]">
                  <th className="p-3 font-medium">{t("col.identifier")}</th>
                  <th className="p-3 font-medium">{t("col.category")}</th>
                  <th className="p-3 font-medium">{t("col.hits")}</th>
                  <th className="p-3 font-medium">{t("col.lastAt")}</th>
                  <th className="p-3 font-medium">{t("col.lastPath")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.identifier}:${r.category}`} className="border-b border-[var(--flux-border)] last:border-0">
                    <td className="p-3 font-mono text-xs">{r.identifier}</td>
                    <td className="p-3">{r.category}</td>
                    <td className="p-3">{r.hits}</td>
                    <td className="p-3 text-xs text-[var(--flux-muted)]">{new Date(r.lastAt).toLocaleString()}</td>
                    <td className="max-w-[240px] truncate p-3 font-mono text-xs" title={r.lastPath}>
                      {r.lastPath}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
