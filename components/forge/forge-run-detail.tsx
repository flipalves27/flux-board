"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import type { ForgeJob } from "@/lib/forge-types";
import { motion, useReducedMotion } from "framer-motion";

type Tab = "plan" | "timeline" | "diff";

function parseSse(buffer: string): { rest: string; events: { event: string; data: string }[] } {
  const events: { event: string; data: string }[] = [];
  let rest = buffer;
  let idx: number;
  while ((idx = rest.indexOf("\n\n")) >= 0) {
    const block = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    let ev = "message";
    const lines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) ev = line.slice(6).trim();
      else if (line.startsWith("data:")) lines.push(line.slice(5).trimStart());
    }
    events.push({ event: ev, data: lines.join("\n") });
  }
  return { rest, events };
}

export function ForgeRunDetail({ runId }: { runId: string }) {
  const locale = useLocale();
  const { getHeaders } = useAuth();
  const t = useTranslations("forgePage");
  const reduceMotion = useReducedMotion();
  const [run, setRun] = useState<ForgeJob | null>(null);
  const [tab, setTab] = useState<Tab>("timeline");
  const [log, setLog] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet<{ run: ForgeJob }>(`/api/forge/runs/${encodeURIComponent(runId)}`, getHeaders());
      setRun(data.run);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "load_error");
    }
  }, [getHeaders, runId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    const url = `/api/forge/runs/${encodeURIComponent(runId)}/stream`;
    void (async () => {
      try {
        const res = await fetch(url, { headers: getHeaders(), signal: ac.signal });
        if (!res.ok || !res.body) return;
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const { rest, events } = parseSse(buf);
          buf = rest;
          for (const ev of events) {
            if (ev.event === "error") {
              try {
                const j = JSON.parse(ev.data) as { message?: string };
                setLog((l) => [...l, `error: ${j.message ?? ev.data}`]);
              } catch {
                setLog((l) => [...l, ev.data]);
              }
            } else {
              setLog((l) => [...l, `${ev.event}: ${ev.data.slice(0, 200)}`]);
            }
          }
        }
        await refresh();
      } catch {
        /* aborted */
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [getHeaders, runId, refresh]);

  const onApprove = useCallback(async () => {
    try {
      await apiPost(`/api/forge/runs/${encodeURIComponent(runId)}/approve-plan`, {}, getHeaders());
      await refresh();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "approve_error");
    }
  }, [getHeaders, runId, refresh]);

  const statusColor = useMemo(() => {
    const s = run?.status;
    if (s === "failed") return "var(--flux-danger)";
    if (s === "merged" || s === "pr_opened") return "var(--flux-success)";
    return "var(--flux-primary-light)";
  }, [run?.status]);

  if (err && !run) {
    return <p className="text-sm text-[var(--flux-danger)]">{err}</p>;
  }
  if (!run) {
    return <div className="h-40 animate-pulse rounded-xl bg-[var(--flux-chrome-alpha-08)]" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/${locale}/forge/runs`}
            className="text-xs font-semibold text-[var(--flux-text-muted)] hover:text-[var(--flux-primary-light)]"
          >
            ← runs
          </Link>
          <h1 className="mt-1 font-display text-xl font-bold text-[var(--flux-text)]">
            Run <span className="font-mono text-base">{run._id}</span>
          </h1>
          <p className="text-xs text-[var(--flux-text-muted)]">
            tier <span className="font-semibold text-[var(--flux-text)]">{run.tier}</span> · status{" "}
            <span className="font-semibold" style={{ color: statusColor }}>
              {run.status}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {run.status === "plan_review" ? (
            <button
              type="button"
              onClick={() => void onApprove()}
              className="rounded-lg bg-[var(--flux-primary)] px-3 py-2 text-xs font-semibold text-white"
            >
              Approve plan
            </button>
          ) : null}
          <Link
            href={`/${locale}/forge/runs/${encodeURIComponent(runId)}/live`}
            className="rounded-lg border border-[var(--flux-primary-alpha-35)] px-3 py-2 text-xs font-semibold text-[var(--flux-primary-light)]"
          >
            {t("liveMode")}
          </Link>
          {run.prUrl ? (
            <a
              href={run.prUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-[var(--flux-success)] px-3 py-2 text-xs font-semibold text-[var(--flux-success)]"
            >
              PR #{run.prNumber}
            </a>
          ) : null}
        </div>
      </div>

      <div className="flex gap-1 border-b border-[var(--flux-chrome-alpha-08)]">
        {(["plan", "timeline", "diff"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-3 py-2 text-xs font-semibold capitalize ${
              tab === k
                ? "border-b-2 border-[var(--flux-primary)] text-[var(--flux-text)]"
                : "text-[var(--flux-text-muted)]"
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      {tab === "plan" ? (
        <div className="prose prose-invert max-w-none text-sm">
          <pre className="whitespace-pre-wrap rounded-xl border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-mid)] p-4 font-mono text-[13px] text-[var(--flux-text)]">
            {run.planMarkdown ?? "—"}
          </pre>
        </div>
      ) : null}

      {tab === "timeline" ? (
        <ul className="space-y-2">
          {run.timeline.map((e, i) => (
            <motion.li
              key={`${e.at}-${i}`}
              initial={reduceMotion ? false : { opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: reduceMotion ? 0 : i * 0.04 }}
              className="flex gap-3 rounded-lg border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-mid)]/80 px-3 py-2 text-xs"
            >
              <span className="font-mono text-[var(--flux-text-muted)]">{e.at.slice(11, 19)}</span>
              <span className="font-semibold text-[var(--flux-text)]">{e.phase}</span>
              {e.detail ? <span className="text-[var(--flux-text-muted)]">{e.detail}</span> : null}
            </motion.li>
          ))}
        </ul>
      ) : null}

      {tab === "diff" ? (
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-dark)] p-4 font-mono text-[12px] leading-relaxed text-[var(--flux-text)]">
          {run.diffText ?? "—"}
        </pre>
      ) : null}

      {log.length > 0 ? (
        <details className="rounded-lg border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-black-alpha-04)] p-3 text-[10px] text-[var(--flux-text-muted)]">
          <summary className="cursor-pointer font-semibold">Stream</summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap">{log.join("\n")}</pre>
        </details>
      ) : null}
    </div>
  );
}
