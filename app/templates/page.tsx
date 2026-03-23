"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { Header } from "@/components/header";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { useToast } from "@/context/toast-context";
import type { TemplateCategory } from "@/lib/template-types";
import { AiTemplateConversation } from "@/components/templates/ai-template-conversation";
import { PriorityMatrixWorkspace } from "@/components/templates/priority-matrix-workspace";

type Row = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: TemplateCategory;
  pricingTier: "free" | "premium";
  creatorOrgName?: string;
  templateKind?: "kanban" | "priority_matrix";
  priorityMatrixModel?: "eisenhower" | "grid4";
};

export default function TemplatesShowcasePage() {
  const router = useRouter();
  const locale = useLocale();
  const localeRoot = `/${locale}`;
  const t = useTranslations("templates");
  const { user, getHeaders, isChecked } = useAuth();
  const { pushToast } = useToast();
  const [createMode, setCreateMode] = useState<"ai" | "matrix">("ai");

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<TemplateCategory | "all">("all");
  const [importingId, setImportingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isChecked) return;
    if (!user) {
      router.replace(`${localeRoot}/login`);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const q = filter === "all" ? "" : `?category=${encodeURIComponent(filter)}`;
        const data = await apiGet<{ templates: Row[] }>(`/api/templates${q}`);
        if (!cancelled) setRows(data?.templates ?? []);
      } catch (e) {
        if (!cancelled) {
          pushToast({ kind: "error", title: t("loadError") });
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isChecked, user, router, localeRoot, filter, pushToast, t]);

  async function importTemplate(id: string, title: string) {
    if (!user) return;
    setImportingId(id);
    try {
      const name = `${title}`.trim().slice(0, 100) || "Board";
      const res = await apiPost<{ board: { id: string } }>(
        "/api/boards",
        { name, templateId: id },
        getHeaders()
      );
      const bid = res?.board?.id;
      if (bid) {
        pushToast({ kind: "success", title: t("importing"), description: name });
        router.push(`${localeRoot}/board/${encodeURIComponent(bid)}`);
      }
    } catch (e) {
      pushToast({
        kind: "error",
        title: e instanceof ApiError ? e.message : "Erro ao importar.",
      });
    } finally {
      setImportingId(null);
    }
  }

  if (!isChecked || !user) return null;

  return (
    <div className="min-h-screen bg-[var(--flux-surface-dark)]">
      <Header title={t("title")} backHref={`${localeRoot}/boards`} backLabel="← Boards" />
      <main className="max-w-[1200px] mx-auto px-6 py-10 space-y-10">
        <p className="text-sm text-[var(--flux-text-muted)]">{t("subtitle")}</p>

        <section className="rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] p-6">
          <h2 className="font-display font-semibold text-[var(--flux-text)] mb-3">{t("createSectionTitle")}</h2>
          <div
            className="flex flex-wrap gap-2 mb-5 p-1 rounded-[var(--flux-rad-lg)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-chrome-alpha-10)]"
            role="tablist"
            aria-label={t("createSectionTitle")}
          >
            <button
              type="button"
              role="tab"
              aria-selected={createMode === "ai"}
              className={`px-4 py-2 rounded-[var(--flux-rad)] text-sm font-medium transition-colors ${
                createMode === "ai"
                  ? "bg-[var(--flux-primary)] text-[var(--flux-ink-on-bright)] shadow-sm"
                  : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
              }`}
              onClick={() => setCreateMode("ai")}
            >
              {t("createModeAi")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={createMode === "matrix"}
              className={`px-4 py-2 rounded-[var(--flux-rad)] text-sm font-medium transition-colors ${
                createMode === "matrix"
                  ? "bg-[var(--flux-primary)] text-[var(--flux-ink-on-bright)] shadow-sm"
                  : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
              }`}
              onClick={() => setCreateMode("matrix")}
            >
              {t("createModeMatrix")}
            </button>
          </div>

          {createMode === "ai" ? (
            <>
              <h3 className="font-display font-semibold text-[var(--flux-text)] mb-2">{t("aiTitle")}</h3>
              <p className="text-xs text-[var(--flux-text-muted)] mb-4">{t("aiHint")}</p>
              <AiTemplateConversation getHeaders={getHeaders} localeRoot={localeRoot} />
            </>
          ) : (
            <>
              <h3 className="font-display font-semibold text-[var(--flux-text)] mb-2">{t("matrixSectionTitle")}</h3>
              <p className="text-xs text-[var(--flux-text-muted)] mb-4">{t("matrixSectionHint")}</p>
              <PriorityMatrixWorkspace getHeaders={getHeaders} isAdmin={Boolean(user?.isAdmin)} />
            </>
          )}
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs text-[var(--flux-text-muted)]">Categoria</label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as TemplateCategory | "all")}
            className="px-3 py-2 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-sm"
          >
            <option value="all">{t("filterAll")}</option>
            <option value="sales">Vendas</option>
            <option value="operations">Operações</option>
            <option value="projects">Projetos</option>
            <option value="hr">RH</option>
            <option value="marketing">Marketing</option>
            <option value="customer_success">Customer Success</option>
            <option value="support">Suporte</option>
            <option value="insurance_warranty">Seguro / Garantia</option>
          </select>
        </div>

        {loading ? (
          <p className="text-[var(--flux-text-muted)]">{t("loading")}</p>
        ) : rows.length === 0 ? (
          <p className="text-[var(--flux-text-muted)]">{t("empty")}</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li
                key={r.id}
                className="rounded-[var(--flux-rad-lg)] border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-elevated)]/80 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-display font-semibold text-[var(--flux-text)]">{r.title}</h3>
                    {r.templateKind === "priority_matrix" && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-[var(--flux-primary-alpha-15)] text-[var(--flux-primary)] border border-[var(--flux-primary-alpha-25)]">
                        {r.priorityMatrixModel === "grid4" ? t("matrixGridBadge") : t("matrixBadge")}
                      </span>
                    )}
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        r.pricingTier === "premium"
                          ? "bg-[var(--flux-accent-alpha-20)] text-[var(--flux-accent)]"
                          : "bg-[var(--flux-secondary-alpha-12)] text-[var(--flux-secondary)]"
                      }`}
                    >
                      {r.pricingTier === "premium" ? t("premium") : t("free")}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--flux-text-muted)] mt-1">{r.description}</p>
                  {r.creatorOrgName && (
                    <p className="text-[10px] text-[var(--flux-text-muted)] mt-2">Por {r.creatorOrgName}</p>
                  )}
                </div>
                <button
                  type="button"
                  className="btn-primary shrink-0"
                  disabled={importingId === r.id}
                  onClick={() => void importTemplate(r.id, r.title)}
                >
                  {importingId === r.id ? t("importing") : t("import")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
