"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { Header } from "@/components/header";
import { apiGet } from "@/lib/api-client";
import { DataFadeIn } from "@/components/ui/data-fade-in";

type TemplateItem = {
  _id: string;
  title: string;
  description?: string;
  category?: string;
  creatorOrgName?: string;
  snapshot?: { bucketOrder?: Array<{ key: string; label: string }> };
};

type MarketplaceResponse = {
  ok: boolean;
  templates: TemplateItem[];
};

const CATEGORIES = ["all", "kanban", "scrum", "bpmn", "matrix"] as const;

export default function TemplateMarketplacePage() {
  const { user, getHeaders, isChecked } = useAuth();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("templateMarketplace");

  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");

  useEffect(() => {
    if (!isChecked || !user) return;
    (async () => {
      try {
        const qs = new URLSearchParams();
        if (category !== "all") qs.set("category", category);
        if (search.trim()) qs.set("q", search.trim());
        const res = await apiGet<MarketplaceResponse>(`/api/templates/marketplace?${qs}`, getHeaders());
        setTemplates(res.templates ?? []);
      } catch {
        setTemplates([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [isChecked, user, getHeaders, category, search]);

  if (!isChecked || !user) return null;

  return (
    <>
      <Header title={t("title")} backHref={`/${locale}/templates`} />
      <main className="mx-auto max-w-6xl px-4 pb-12 pt-6 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => { setCategory(cat); setLoading(true); }}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  category === cat
                    ? "border-[var(--flux-primary-alpha-45)] bg-[var(--flux-primary-alpha-12)] text-[var(--flux-text)]"
                    : "border-[var(--flux-chrome-alpha-10)] text-[var(--flux-text-muted)] hover:border-[var(--flux-chrome-alpha-20)]"
                }`}
              >
                {t(`categories.${cat}`)}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search")}
            className="w-full rounded-xl border border-[var(--flux-chrome-alpha-10)] bg-transparent px-3 py-2 text-sm text-[var(--flux-text)] placeholder:text-[var(--flux-text-muted)] sm:max-w-xs"
          />
        </div>

        {loading ? (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-2xl bg-[var(--flux-chrome-alpha-06)]" />
            ))}
          </div>
        ) : (
          <DataFadeIn active={!loading}>
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {templates.map((tpl) => {
                const buckets = tpl.snapshot?.bucketOrder ?? [];
                return (
                  <div
                    key={tpl._id}
                    className="flex flex-col rounded-2xl border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-card)] p-5 transition-colors hover:border-[var(--flux-primary-alpha-30)]"
                  >
                    <h3 className="font-display text-sm font-bold text-[var(--flux-text)]">{tpl.title}</h3>
                    {tpl.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-[var(--flux-text-muted)]">{tpl.description}</p>
                    )}
                    <div className="mt-3 flex items-center gap-3 text-xs text-[var(--flux-text-muted)]">
                      {tpl.category && (
                        <span className="rounded-full border border-[var(--flux-chrome-alpha-10)] px-2 py-0.5">{tpl.category}</span>
                      )}
                      {tpl.creatorOrgName && (
                        <span>{tpl.creatorOrgName}</span>
                      )}
                    </div>
                    {buckets.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {buckets.slice(0, 5).map((col, i) => (
                          <span key={i} className="rounded-md bg-[var(--flux-chrome-alpha-06)] px-2 py-0.5 text-[10px] text-[var(--flux-text-muted)]">
                            {col.label}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-auto pt-4">
                      <button
                        type="button"
                        onClick={() => router.push(`/${locale}/templates?import=${tpl._id}`)}
                        className="btn-primary w-full text-xs"
                      >
                        {t("useTemplate")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {templates.length === 0 && (
              <p className="py-12 text-center text-sm text-[var(--flux-text-muted)]">{t("empty")}</p>
            )}
          </DataFadeIn>
        )}
      </main>
    </>
  );
}
