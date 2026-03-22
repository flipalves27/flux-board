"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiGet, apiPost } from "@/lib/api-client";

type CadenceType = "service_delivery_review" | "replenishment" | "flow_review" | "retro_de_fluxo";

type CadenceMeta = { type: CadenceType; label: string; description: string };

type Props = {
  boardId: string;
  boardLabel: string;
  getHeaders: () => Record<string, string>;
};

export function KanbanCadencePanel({ boardId, boardLabel, getHeaders }: Props) {
  const t = useTranslations("ceremonies");
  const [types, setTypes] = useState<CadenceMeta[]>([]);
  const [sel, setSel] = useState<CadenceType>("flow_review");
  const [loading, setLoading] = useState(false);
  const [out, setOut] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadTypes = useCallback(async () => {
    try {
      const data = await apiGet<{ availableTypes?: CadenceMeta[] }>(
        `/api/boards/${encodeURIComponent(boardId)}/kanban-cadence`,
        getHeaders()
      );
      if (Array.isArray(data.availableTypes)) setTypes(data.availableTypes);
    } catch {
      /* ignore */
    }
  }, [boardId, getHeaders]);

  useEffect(() => {
    void loadTypes();
  }, [loadTypes]);

  const run = async () => {
    setLoading(true);
    setErr(null);
    setOut(null);
    try {
      const data = await apiPost<{ cadence?: unknown }>(
        `/api/boards/${encodeURIComponent(boardId)}/kanban-cadence`,
        { type: sel },
        getHeaders()
      );
      setOut(JSON.stringify(data.cadence ?? data, null, 2));
    } catch {
      setErr(t("cadenceError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-2xl border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-elevated)] p-4 space-y-3">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">{t("cadenceTitle")}</h2>
        <p className="text-sm text-[var(--flux-text)]">{boardLabel}</p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-[var(--flux-text-muted)]">
          {t("cadenceType")}
          <select
            value={sel}
            onChange={(e) => setSel(e.target.value as CadenceType)}
            className="rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-2 py-1.5 text-sm text-[var(--flux-text)]"
          >
            {types.length ? (
              types.map((x) => (
                <option key={x.type} value={x.type}>
                  {x.label}
                </option>
              ))
            ) : (
              <>
                <option value="flow_review">flow_review</option>
                <option value="service_delivery_review">service_delivery_review</option>
                <option value="replenishment">replenishment</option>
                <option value="retro_de_fluxo">retro_de_fluxo</option>
              </>
            )}
          </select>
        </label>
        <button
          type="button"
          disabled={loading}
          onClick={() => void run()}
          className="rounded-lg bg-[var(--flux-accent)] px-3 py-2 text-xs font-semibold text-[var(--flux-surface-dark)] disabled:opacity-50"
        >
          {loading ? t("cadenceRunning") : t("cadenceRun")}
        </button>
      </div>
      {err ? <p className="text-xs text-[var(--flux-danger)]">{err}</p> : null}
      {out ? (
        <pre className="max-h-48 overflow-auto rounded-lg border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-dark)]/40 p-3 text-[11px] text-[var(--flux-text-muted)]">
          {out}
        </pre>
      ) : null}
    </section>
  );
}
