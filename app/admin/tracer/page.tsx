"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { Header } from "@/components/header";
import { useFluxDiagnosticsStore, type FluxDiagEntry } from "@/stores/flux-diagnostics-store";
import { FLUX_DIAG_STORAGE_KEY, readFluxDiagEnabled } from "@/lib/flux-diagnostics-shared";

const KINDS: Array<FluxDiagEntry["kind"] | "all"> = ["all", "react-boundary", "window", "unhandledrejection", "console"];

export default function AdminTracerPage() {
  const t = useTranslations("adminTracer");
  const router = useRouter();
  const { user, isChecked } = useAuth();
  const entries = useFluxDiagnosticsStore((s) => s.entries);
  const clear = useFluxDiagnosticsStore((s) => s.clear);
  const sessionTraceId = useFluxDiagnosticsStore((s) => s.sessionTraceId);

  const [kind, setKind] = useState<(typeof KINDS)[number]>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fluxDebugOn, setFluxDebugOn] = useState(false);

  useEffect(() => {
    setFluxDebugOn(readFluxDiagEnabled());
  }, []);

  useEffect(() => {
    if (!isChecked || !user) {
      router.replace("/login");
      return;
    }
    if (!user.isAdmin) {
      router.replace("/boards");
    }
  }, [isChecked, user, router]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (kind !== "all" && e.kind !== kind) return false;
      if (!q) return true;
      const hay = `${e.message} ${e.stack ?? ""} ${e.route ?? ""} ${e.kind} ${e.extra ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [entries, kind, query]);

  const selected = useMemo(
    () => filtered.find((e) => e.id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId]
  );

  const copyJson = async () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      sessionTraceId,
      href: typeof window !== "undefined" ? window.location.href : "",
      entries: filtered,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    } catch {
      /* ignore */
    }
  };

  const copyEntry = async (e: FluxDiagEntry) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(e, null, 2));
    } catch {
      /* ignore */
    }
  };

  if (!isChecked || !user?.isAdmin) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header title={t("title")} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <p className="mb-4 text-sm text-[var(--flux-muted)]">{t("subtitle")}</p>

        <div className="mb-6 rounded-lg border border-[var(--flux-border)] bg-[var(--flux-surface)]/80 p-4 text-sm">
          <p className="mb-2 font-medium text-[var(--flux-text)]">{t("howTo")}</p>
          <ul className="list-inside list-disc space-y-1 text-[var(--flux-text-muted)]">
            <li>
              {t("hintFluxDebug")}{" "}
              <code className="rounded bg-black/30 px-1 text-amber-200/90">?fluxDebug=1</code> {t("hintOr")}{" "}
              <code className="rounded bg-black/30 px-1 text-amber-200/90">
                localStorage.setItem(&quot;{FLUX_DIAG_STORAGE_KEY}&quot;,&quot;1&quot;)
              </code>
            </li>
            <li>
              {t("hintFloating")} <code className="rounded bg-black/30 px-1">window.__FLUX_DIAG__.dump()</code>
            </li>
          </ul>
          <p className="mt-3 text-xs text-[var(--flux-text-muted)]">
            {t("fluxDebugStatus")}:{" "}
            <span className={fluxDebugOn ? "text-emerald-400" : "text-amber-300"}>
              {fluxDebugOn ? t("fluxDebugOn") : t("fluxDebugOff")}
            </span>
          </p>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span>{t("filterKind")}</span>
            <select
              className="rounded-md border border-[var(--flux-border)] bg-[var(--flux-surface)] px-2 py-1 text-sm"
              value={kind}
              onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[200px] flex-1 items-center gap-2 text-sm">
            <span>{t("search")}</span>
            <input
              type="search"
              className="flex-1 rounded-md border border-[var(--flux-border)] bg-[var(--flux-surface)] px-2 py-1 text-sm"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
            />
          </label>
          <button
            type="button"
            className="rounded-md border border-[var(--flux-border)] bg-[var(--flux-surface)] px-3 py-1 text-sm hover:bg-black/20"
            onClick={() => void copyJson()}
          >
            {t("copyJson")}
          </button>
          <button
            type="button"
            className="rounded-md border border-red-500/40 bg-red-950/30 px-3 py-1 text-sm text-red-200 hover:bg-red-950/50"
            onClick={() => {
              clear();
              setSelectedId(null);
            }}
          >
            {t("clear")}
          </button>
        </div>

        <div className="mb-2 text-xs text-[var(--flux-text-muted)]">
          {t("sessionTrace")}: <code className="text-amber-200/80">{sessionTraceId || "—"}</code> · {t("count")}:{" "}
          {filtered.length}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="max-h-[min(70vh,560px)] overflow-auto rounded-lg border border-[var(--flux-border)] bg-black/20">
            {filtered.length === 0 ? (
              <p className="p-6 text-sm text-[var(--flux-text-muted)]">{t("empty")}</p>
            ) : (
              <ul className="divide-y divide-[var(--flux-border)]">
                {filtered.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(e.id)}
                      className={`w-full px-3 py-2 text-left text-sm transition hover:bg-white/5 ${
                        selected?.id === e.id ? "bg-amber-950/40" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-[10px] text-[var(--flux-text-muted)]">
                        <span className="font-mono text-amber-200/80">{e.kind}</span>
                        <span>{e.at}</span>
                      </div>
                      <div className="mt-1 line-clamp-2 break-words text-[13px] text-[var(--flux-text)]">{e.message}</div>
                      {e.route ? (
                        <div className="mt-1 truncate text-[10px] text-cyan-200/70" title={e.route}>
                          {e.route}
                        </div>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="max-h-[min(70vh,560px)] overflow-auto rounded-lg border border-[var(--flux-border)] bg-[var(--flux-surface)]/60 p-4">
            {selected ? (
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs text-amber-200/90">{selected.kind}</span>
                  <button
                    type="button"
                    className="rounded border border-[var(--flux-border)] px-2 py-0.5 text-xs"
                    onClick={() => void copyEntry(selected)}
                  >
                    {t("copyEntry")}
                  </button>
                </div>
                <DetailRow label={t("detail.at")} value={selected.at} />
                <DetailRow label={t("detail.message")} value={selected.message} mono />
                <DetailRow label={t("detail.route")} value={selected.route} />
                <DetailRow label={t("detail.href")} value={selected.href} mono small />
                <DetailRow label={t("detail.locale")} value={selected.locale} />
                <DetailRow label={t("detail.appVersion")} value={selected.appVersion} mono />
                <DetailRow label={t("detail.traceId")} value={selected.traceId} mono />
                <DetailRow label={t("detail.severity")} value={selected.severity} />
                {selected.hints?.length ? (
                  <div>
                    <div className="mb-1 text-xs font-semibold text-[var(--flux-text-muted)]">{t("detail.hints")}</div>
                    <ul className="list-inside list-disc space-y-1 text-xs text-[var(--flux-text)]">
                      {selected.hints.map((h, i) => (
                        <li key={i}>{h}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {selected.docLinks?.length ? (
                  <div>
                    <div className="mb-1 text-xs font-semibold text-[var(--flux-text-muted)]">{t("detail.docs")}</div>
                    <ul className="space-y-1">
                      {selected.docLinks.map((d) => (
                        <li key={d.url}>
                          <a
                            href={d.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-cyan-300 underline hover:text-cyan-200"
                          >
                            {d.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {selected.stack ? (
                  <div>
                    <div className="mb-1 text-xs font-semibold text-[var(--flux-text-muted)]">{t("detail.stack")}</div>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-black/30 p-2 text-[10px] text-[var(--flux-text-muted)]">
                      {selected.stack}
                    </pre>
                  </div>
                ) : null}
                {selected.componentStack ? (
                  <div>
                    <div className="mb-1 text-xs font-semibold text-[var(--flux-text-muted)]">
                      {t("detail.componentStack")}
                    </div>
                    <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-black/30 p-2 text-[10px] text-cyan-200/70">
                      {selected.componentStack}
                    </pre>
                  </div>
                ) : null}
                {selected.extra ? <DetailRow label={t("detail.extra")} value={selected.extra} mono small /> : null}
              </div>
            ) : (
              <p className="text-sm text-[var(--flux-text-muted)]">{t("selectPrompt")}</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
  small,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  small?: boolean;
}) {
  if (value == null || value === "") return null;
  return (
    <div>
      <div className="mb-0.5 text-xs font-semibold text-[var(--flux-text-muted)]">{label}</div>
      <div className={`break-words ${mono ? "font-mono" : ""} ${small ? "text-[11px]" : "text-sm"}`}>{value}</div>
    </div>
  );
}
