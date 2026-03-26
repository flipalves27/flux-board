"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { Header } from "@/components/header";
import { apiGet } from "@/lib/api-client";
import { DataFadeIn } from "@/components/ui/data-fade-in";

type CardItem = {
  id: string;
  title: string;
  boardId: string;
  boardName: string;
  bucket: string;
  priority: string;
  progress: string;
  dueDate: string | null;
  blockedBy: string[];
};

type WorkloadStats = {
  totalAssigned: number;
  inProgress: number;
  blocked: number;
  overdue: number;
  dueSoon: number;
  completedThisWeek: number;
  weeklyThroughput: number[];
};

type Suggestion = {
  cardId: string;
  reason: string;
  urgencyScore: number;
};

type WorkloadResponse = {
  ok: boolean;
  cards: CardItem[];
  stats: WorkloadStats;
  suggestions: Suggestion[];
};

const PRIORITY_COLORS: Record<string, string> = {
  Urgente: "bg-[var(--flux-danger)]/15 text-[var(--flux-danger)] border-[var(--flux-danger)]/30",
  Importante: "bg-[var(--flux-warning)]/15 text-[var(--flux-warning)] border-[var(--flux-warning)]/30",
  Média: "bg-[var(--flux-info)]/15 text-[var(--flux-info)] border-[var(--flux-info)]/30",
};

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-card)] p-5">
      <p className="text-sm text-[var(--flux-text-muted)]">{label}</p>
      <p className={`mt-1 font-display text-3xl font-bold tracking-tight ${accent ?? "text-[var(--flux-text)]"}`}>
        {value}
      </p>
    </div>
  );
}

export default function MyWorkPage() {
  const { user, getHeaders, isChecked } = useAuth();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("myWork");

  const [data, setData] = useState<WorkloadResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isChecked) return;
    if (!user) {
      router.replace(`/${locale}/login`);
      return;
    }
    (async () => {
      try {
        const res = await apiGet<WorkloadResponse>("/api/users/me/workload", getHeaders());
        setData(res);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, [isChecked, user, locale, router, getHeaders]);

  const sortedCards = useMemo(() => {
    if (!data) return [];
    const suggestionMap = new Map(data.suggestions.map((s) => [s.cardId, s]));
    return [...data.cards].sort((a, b) => {
      const sa = suggestionMap.get(a.id)?.urgencyScore ?? 0;
      const sb = suggestionMap.get(b.id)?.urgencyScore ?? 0;
      return sb - sa;
    });
  }, [data]);

  if (!isChecked || !user) return null;

  return (
    <>
      <Header title={t("title")} backHref={`/${locale}/boards`} />
      <main className="mx-auto max-w-6xl px-4 pb-12 pt-6 sm:px-6">
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-[var(--flux-chrome-alpha-06)]" />
            ))}
          </div>
        ) : data ? (
          <DataFadeIn active={!loading}>
            <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard label={t("stats.assigned")} value={data.stats.totalAssigned} />
              <StatCard label={t("stats.inProgress")} value={data.stats.inProgress} accent="text-[var(--flux-info)]" />
              <StatCard label={t("stats.blocked")} value={data.stats.blocked} accent="text-[var(--flux-warning)]" />
              <StatCard label={t("stats.overdue")} value={data.stats.overdue} accent="text-[var(--flux-danger)]" />
              <StatCard label={t("stats.dueSoon")} value={data.stats.dueSoon} accent="text-[var(--flux-warning)]" />
              <StatCard label={t("stats.completedWeek")} value={data.stats.completedThisWeek} accent="text-[var(--flux-success)]" />
            </section>

            <section className="mt-8">
              <h2 className="mb-4 font-display text-lg font-bold text-[var(--flux-text)]">
                {t("prioritized")}
              </h2>
              <div className="space-y-3">
                {sortedCards.map((card) => {
                  const suggestion = data.suggestions.find((s) => s.cardId === card.id);
                  return (
                    <button
                      key={`${card.boardId}-${card.id}`}
                      type="button"
                      onClick={() => router.push(`/${locale}/board/${card.boardId}?card=${card.id}`)}
                      className="flex w-full items-center gap-4 rounded-2xl border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-card)] p-4 text-left transition-colors hover:border-[var(--flux-primary-alpha-30)] hover:bg-[var(--flux-primary-alpha-04)]"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-sm font-semibold text-[var(--flux-text)]">{card.title}</p>
                        <p className="mt-0.5 text-xs text-[var(--flux-text-muted)]">
                          {card.boardName} &middot; {card.bucket}
                        </p>
                        {suggestion && (
                          <p className="mt-1 text-xs text-[var(--flux-text-muted)] italic">{suggestion.reason}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${PRIORITY_COLORS[card.priority] ?? ""}`}>
                          {card.priority}
                        </span>
                        {card.dueDate && (
                          <span className="text-xs tabular-nums text-[var(--flux-text-muted)]">{card.dueDate}</span>
                        )}
                        {card.blockedBy.length > 0 && (
                          <span className="text-xs text-[var(--flux-danger)]">Bloqueado</span>
                        )}
                      </div>
                    </button>
                  );
                })}
                {sortedCards.length === 0 && (
                  <p className="py-8 text-center text-sm text-[var(--flux-text-muted)]">{t("empty")}</p>
                )}
              </div>
            </section>
          </DataFadeIn>
        ) : (
          <p className="py-8 text-center text-sm text-[var(--flux-text-muted)]">{t("error")}</p>
        )}
      </main>
    </>
  );
}
