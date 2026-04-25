"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { Header } from "@/components/header";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut, ApiError } from "@/lib/api-client";
import { useToast } from "@/context/toast-context";
import { FluxEmptyState } from "@/components/ui/flux-empty-state";
import type { TemplateCategory } from "@/lib/template-types";
import type { BoardMethodology } from "@/lib/board-methodology";
import { AiTemplateConversation } from "@/components/templates/ai-template-conversation";

type Row = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: TemplateCategory;
  pricingTier: "free" | "premium";
  creatorOrgId: string;
  creatorOrgName?: string;
  templateKind?: "kanban" | "priority_matrix" | "bpmn";
  priorityMatrixModel?: "eisenhower" | "grid4";
  status?: "draft" | "published" | "archived";
  version?: number;
  boardMethodology?: BoardMethodology | null;
};

export default function TemplatesShowcasePage() {
  const router = useRouter();
  const locale = useLocale();
  const localeRoot = `/${locale}`;
  const t = useTranslations("templates");
  const { user, getHeaders, isChecked } = useAuth();
  const { pushToast } = useToast();
  const [createMode, setCreateMode] = useState<"ai" | "matrix" | "bpmn">("ai");

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<TemplateCategory | "all">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "published" | "archived">("all");
  const [methodologyFilter, setMethodologyFilter] = useState<"all" | BoardMethodology | "none">("all");
  const [importingId, setImportingId] = useState<string | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

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
        const q = new URLSearchParams();
        if (filter !== "all") q.set("category", filter);
        if (statusFilter !== "all") q.set("status", statusFilter);
        const query = q.toString();
        const data = await apiGet<{ templates: Row[] }>(`/api/templates${query ? `?${query}` : ""}`);
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
  }, [isChecked, user, router, localeRoot, filter, statusFilter, pushToast, t]);

  const visibleRows = useMemo(() => {
    if (methodologyFilter === "all") return rows;
    if (methodologyFilter === "none") return rows.filter((r) => !r.boardMethodology);
    return rows.filter((r) => r.boardMethodology === methodologyFilter);
  }, [rows, methodologyFilter]);

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

  async function removeTemplate(id: string) {
    if (!user) return;
    const confirmed = window.confirm(t("deleteTemplate.confirm"));
    if (!confirmed) return;
    setDeletingTemplateId(id);
    try {
      await apiDelete(`/api/templates/${encodeURIComponent(id)}`, getHeaders());
      setRows((prev) => prev.filter((r) => r.id !== id));
      pushToast({ kind: "success", title: t("deleteTemplate.success") });
    } catch (e) {
      pushToast({
        kind: "error",
        title: e instanceof ApiError ? e.message : t("deleteTemplate.error"),
      });
    } finally {
      setDeletingTemplateId(null);
    }
  }

  async function publishDraft(id: string) {
    setEditingId(id);
    try {
      await apiPatch(`/api/templates/${encodeURIComponent(id)}`, {}, getHeaders());
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: "published", version: (r.version ?? 1) + 1 } : r)));
      pushToast({ kind: "success", title: "Template publicado" });
    } catch (e) {
      pushToast({ kind: "error", title: e instanceof ApiError ? e.message : "Erro ao publicar template." });
    } finally {
      setEditingId(null);
    }
  }

  async function quickEditTemplate(r: Row) {
    const title = window.prompt("Novo título do template", r.title)?.trim();
    if (!title) return;
    setEditingId(r.id);
    try {
      await apiPut(`/api/templates/${encodeURIComponent(r.id)}`, { title }, getHeaders());
      setRows((prev) => prev.map((it) => (it.id === r.id ? { ...it, title } : it)));
      pushToast({ kind: "success", title: "Template atualizado" });
    } catch (e) {
      pushToast({ kind: "error", title: e instanceof ApiError ? e.message : "Erro ao atualizar template." });
    } finally {
      setEditingId(null);
    }
  }

  if (!isChecked || !user) return null;

  return (
    <div className="flux-page-contract min-h-screen" data-flux-area="operational">
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
            <button
              type="button"
              role="tab"
              aria-selected={createMode === "bpmn"}
              className={`px-4 py-2 rounded-[var(--flux-rad)] text-sm font-medium transition-colors ${
                createMode === "bpmn"
                  ? "bg-[var(--flux-primary)] text-[var(--flux-ink-on-bright)] shadow-sm"
                  : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
              }`}
              onClick={() => setCreateMode("bpmn")}
            >
              {t("createModeBpmn")}
            </button>
          </div>

          {createMode === "ai" ? (
            <>
              <h3 className="font-display font-semibold text-[var(--flux-text)] mb-2">{t("aiTitle")}</h3>
              <p className="text-xs text-[var(--flux-text-muted)] mb-4">{t("aiHint")}</p>
              <AiTemplateConversation getHeaders={getHeaders} localeRoot={localeRoot} />
            </>
          ) : createMode === "matrix" ? (
            <>
              <h3 className="font-display font-semibold text-[var(--flux-text)] mb-2">{t("matrixSectionTitle")}</h3>
              <p className="text-xs text-[var(--flux-text-muted)] mb-4">{t("matrixSectionHint")}</p>
              <button
                type="button"
                className="btn-primary"
                onClick={() => router.push(`${localeRoot}/templates/matrix-4x4`)}
              >
                {t("matrixSectionCta")}
              </button>
            </>
          ) : (
            <>
              <h3 className="font-display font-semibold text-[var(--flux-text)] mb-2">{t("bpmnSectionTitle")}</h3>
              <p className="text-xs text-[var(--flux-text-muted)] mb-4">{t("bpmnSectionHint")}</p>
              <button type="button" className="btn-primary" onClick={() => router.push(`${localeRoot}/templates/bpmn`)}>
                {t("bpmnSectionCta")}
              </button>
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
            <option value="insurance_warranty">{t("exportModal.categories.insurance_warranty")}</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | "draft" | "published" | "archived")}
            className="px-3 py-2 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-sm"
          >
            <option value="all">Todos os status</option>
            <option value="draft">Rascunho</option>
            <option value="published">Publicado</option>
            <option value="archived">Arquivado</option>
          </select>
          <label className="text-xs text-[var(--flux-text-muted)] flex items-center gap-2">
            {t("methodologyFilterLabel")}
            <select
              value={methodologyFilter}
              onChange={(e) => setMethodologyFilter(e.target.value as "all" | BoardMethodology | "none")}
              className="px-3 py-2 rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)] border border-[var(--flux-control-border)] text-sm"
            >
              <option value="all">{t("methodologyFilterAll")}</option>
              <option value="none">{t("methodologyFilterUnset")}</option>
              <option value="scrum">Scrum</option>
              <option value="kanban">Kanban</option>
              <option value="lean_six_sigma">LSS</option>
              <option value="discovery">Discovery</option>
              <option value="safe">SAFe</option>
            </select>
          </label>
        </div>

        {loading ? (
          <p className="text-[var(--flux-text-muted)]">{t("loading")}</p>
        ) : rows.length === 0 ? (
          <FluxEmptyState title={t("title")} description={t("empty")} />
        ) : visibleRows.length === 0 ? (
          <FluxEmptyState title={t("title")} description={t("filterEmpty")} />
        ) : (
          <ul className="space-y-3">
            {visibleRows.map((r) => (
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
                    {r.templateKind === "bpmn" && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-[var(--flux-secondary-alpha-12)] text-[var(--flux-secondary)] border border-[var(--flux-secondary-alpha-20)]">
                        {t("bpmnBadge")}
                      </span>
                    )}
                    {r.boardMethodology ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-[var(--flux-chrome-alpha-10)] text-[var(--flux-text-muted)] border border-[var(--flux-chrome-alpha-12)]">
                        {t(`methodologyBadge.${r.boardMethodology}`)}
                      </span>
                    ) : null}
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        r.pricingTier === "premium"
                          ? "bg-[var(--flux-accent-alpha-20)] text-[var(--flux-accent)]"
                          : "bg-[var(--flux-secondary-alpha-12)] text-[var(--flux-secondary)]"
                      }`}
                    >
                      {r.pricingTier === "premium" ? t("premium") : t("free")}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-[var(--flux-chrome-alpha-10)] text-[var(--flux-text-muted)]">
                      {r.status ?? "published"} v{r.version ?? 1}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--flux-text-muted)] mt-1">{r.description}</p>
                  {r.creatorOrgName && (
                    <p className="text-[10px] text-[var(--flux-text-muted)] mt-2">Por {r.creatorOrgName}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn-primary shrink-0"
                    disabled={importingId === r.id}
                    onClick={() => void importTemplate(r.id, r.title)}
                  >
                    {importingId === r.id ? t("importing") : t("import")}
                  </button>
                  {user?.isAdmin || user?.orgId === r.creatorOrgId ? (
                    <button
                      type="button"
                      className="btn-secondary shrink-0"
                      disabled={editingId === r.id}
                      onClick={() => void quickEditTemplate(r)}
                    >
                      {editingId === r.id ? "Salvando..." : "Editar"}
                    </button>
                  ) : null}
                  {(user?.isAdmin || user?.orgId === r.creatorOrgId) && r.status === "draft" ? (
                    <button
                      type="button"
                      className="btn-secondary shrink-0"
                      disabled={editingId === r.id}
                      onClick={() => void publishDraft(r.id)}
                    >
                      {editingId === r.id ? "Publicando..." : "Publicar"}
                    </button>
                  ) : null}
                  {user?.isAdmin || user?.orgId === r.creatorOrgId ? (
                    <button
                      type="button"
                      className="btn-secondary shrink-0"
                      disabled={deletingTemplateId === r.id}
                      onClick={() => void removeTemplate(r.id)}
                    >
                      {deletingTemplateId === r.id ? t("deleteTemplate.deleting") : t("deleteTemplate.cta")}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
