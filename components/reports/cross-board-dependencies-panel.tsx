"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { apiGet, ApiError } from "@/lib/api-client";
import { DependencyGraphView } from "@/components/dependency-map/dependency-graph-view";
import { ChartShell } from "@/components/reports/chart-shell";

const PALETTE = [
  "var(--flux-primary)",
  "var(--flux-secondary)",
  "var(--flux-info)",
  "var(--flux-warning-foreground)",
  "var(--flux-success)",
  "var(--flux-accent-dark)",
];

type GraphPayload = {
  nodes: Array<{ id: string; boardId: string; boardName: string; cardId: string; title: string }>;
  edges: Array<{ source: string; target: string; kind: string; confidence: number }>;
};

export function CrossBoardDependenciesPanel() {
  const t = useTranslations("reports.dependencies");
  const { getHeaders } = useAuth();
  const searchParams = useSearchParams();
  const boardFromUrl = searchParams.get("boardId");
  const [scope, setScope] = useState<"board" | "org">("org");

  useEffect(() => {
    if (boardFromUrl) setScope("board");
  }, [boardFromUrl]);
  const [minConf, setMinConf] = useState(0.75);
  const [data, setData] = useState<GraphPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const colorMap = useMemo(() => {
    const m = new Map<string, string>();
    let i = 0;
    return (bid: string) => {
      if (!m.has(bid)) {
        m.set(bid, PALETTE[i % PALETTE.length]);
        i++;
      }
      return m.get(bid)!;
    };
  }, []);

  const load = useCallback(async () => {
    const bid = boardFromUrl;
    if (scope === "board" && !bid) {
      setError(t("needBoard"));
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        scope,
        minConfidence: String(minConf),
      });
      if (scope === "board" && bid) {
        q.set("boardId", bid);
      }
      const res = await apiGet<GraphPayload>(`/api/org/dependency-graph?${q.toString()}`, getHeaders());
      setData(res);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError(t("loadError"));
      }
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [boardFromUrl, getHeaders, minConf, scope, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ChartShell title={t("title")} hint={t("hint")} chartId="dependencies" explainPayload={{ kind: "dependency_graph" }}>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label className="flex items-center gap-2 text-xs font-semibold text-[var(--flux-text-muted)]">
          {t("scope")}
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as "board" | "org")}
            className="rounded-lg border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-2 py-1 text-sm text-[var(--flux-text)]"
          >
            <option value="board">{t("scopeBoard")}</option>
            <option value="org">{t("scopeOrg")}</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold text-[var(--flux-text-muted)]">
          {t("minConfidence")}
          <input
            type="range"
            min={0.5}
            max={1}
            step={0.05}
            value={minConf}
            onChange={(e) => setMinConf(Number(e.target.value))}
          />
          <span className="font-mono text-[var(--flux-text)]">{(minConf * 100).toFixed(0)}%</span>
        </label>
        <button type="button" className="btn-secondary text-xs py-1 px-2" onClick={() => void load()} disabled={loading}>
          {t("refresh")}
        </button>
      </div>

      {error ? (
        <p className="text-sm text-[var(--flux-danger)]">{error}</p>
      ) : loading ? (
        <p className="text-sm text-[var(--flux-text-muted)]">{t("loading")}</p>
      ) : data && data.nodes.length ? (
        <DependencyGraphView nodes={data.nodes} edges={data.edges} boardColor={(bid) => colorMap(bid)} />
      ) : (
        <p className="text-sm text-[var(--flux-text-muted)]">{t("empty")}</p>
      )}
    </ChartShell>
  );
}
