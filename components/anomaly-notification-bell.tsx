"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { apiGet, ApiError } from "@/lib/api-client";
import { AiModelHint } from "@/components/ai-model-hint";

type RecentPayload = {
  mongo: boolean;
  unreadCount: number;
  alerts: Array<{
    id: string;
    kind: string;
    severity: string;
    title: string;
    message: string;
    boardId?: string;
    boardName?: string;
    read: boolean;
    createdAt: string;
    suggestedAction?: string;
    suggestedActionModel?: string;
    suggestedActionProvider?: string;
  }>;
};

function severityRing(sev: string): string {
  if (sev === "critical") return "border-[var(--flux-danger)]";
  if (sev === "warning") return "border-[var(--flux-warning)]";
  return "border-[var(--flux-primary-light)]";
}

export function AnomalyNotificationBell() {
  const { user, getHeaders, isChecked, isLoading, refreshSession } = useAuth();
  const locale = useLocale();
  const t = useTranslations("header.anomalyBell");
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<RecentPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [planBlocked, setPlanBlocked] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    if (!isChecked || !user) return;
    setErr(null);
    try {
      const res = await apiGet<RecentPayload>("/api/anomaly-alerts/recent?limit=14", getHeaders());
      setData(res);
      setPlanBlocked(false);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 403 || e.status === 402)) {
        setData(null);
        setErr(null);
        setPlanBlocked(true);
        return;
      }
      if (e instanceof ApiError && e.status === 401) {
        setData(null);
        setErr(null);
        await refreshSession();
        return;
      }
      if (e instanceof ApiError) {
        setErr(e.message);
      } else {
        setErr(t("loadError"));
      }
      setData(null);
    }
  }, [getHeaders, user, isChecked, refreshSession, t]);

  useEffect(() => {
    if (!isChecked || !user || isLoading) return;

    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      void load();
    };

    let idleHandle: number | undefined;
    let fallbackTimeout: number | undefined;
    if (typeof window.requestIdleCallback === "function") {
      idleHandle = window.requestIdleCallback(run, { timeout: 3000 });
    } else {
      fallbackTimeout = window.setTimeout(run, 0) as unknown as number;
    }

    const intervalId = window.setInterval(() => {
      if (!cancelled) void load();
    }, 60_000) as unknown as number;

    return () => {
      cancelled = true;
      if (idleHandle !== undefined && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleHandle);
      }
      if (fallbackTimeout !== undefined) window.clearTimeout(fallbackTimeout);
      window.clearInterval(intervalId);
    };
  }, [isChecked, user, isLoading, load]);

  useEffect(() => {
    if (!isChecked || !user) return;
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [isChecked, user, load]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (ev: MouseEvent) => {
      const el = wrapRef.current;
      if (el && !el.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!isChecked || isLoading || !user || planBlocked) return null;

  const unread = data?.unreadCount ?? 0;
  const showBadge = data?.mongo && unread > 0;

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) load();
        }}
        className="relative flex h-9 w-9 items-center justify-center rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-15)] bg-[var(--flux-chrome-alpha-05)] text-[var(--flux-text)] flux-motion-standard transition-colors hover:bg-[var(--flux-chrome-alpha-10)] motion-safe:active:scale-[0.94]"
        aria-expanded={open}
        aria-label={t("ariaLabel")}
      >
        <span className="text-base leading-none" aria-hidden>
          🔔
        </span>
        {showBadge ? (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--flux-danger)] px-1 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+6px)] z-[var(--flux-z-anomaly-bell-popover)] w-[min(100vw-24px,380px)] rounded-[var(--flux-rad)] flux-glass-elevated flux-depth-2">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--flux-chrome-alpha-10)] px-3 py-2">
            <span className="text-xs font-bold uppercase tracking-wide text-[var(--flux-text-muted)]">{t("title")}</span>
            <Link
              href={`/${locale}/reports`}
              className="text-[11px] font-semibold text-[var(--flux-primary-light)] hover:underline"
              onClick={() => setOpen(false)}
            >
              {t("openReports")}
            </Link>
          </div>
          <div className="max-h-[min(70vh,360px)] overflow-y-auto p-2">
            {err ? (
              <p className="px-2 py-3 text-xs text-[var(--flux-danger)]">{err}</p>
            ) : !data?.mongo ? (
              <p className="px-2 py-3 text-xs text-[var(--flux-text-muted)]">{t("noMongo")}</p>
            ) : data.alerts.length === 0 ? (
              <p className="px-2 py-3 text-xs text-[var(--flux-text-muted)]">{t("empty")}</p>
            ) : (
              <ul className="space-y-2">
                {data.alerts.map((a) => (
                  <li
                    key={a.id}
                    className={`rounded-[var(--flux-rad-sm)] border-l-2 bg-[var(--flux-black-alpha-15)] px-2.5 py-2 ${severityRing(a.severity)}`}
                  >
                    <p className="text-xs font-semibold text-[var(--flux-text)]">{a.title}</p>
                    {a.suggestedAction ? (
                      <div className="mt-1 space-y-0.5">
                        <p className="text-[11px] leading-snug text-[var(--flux-secondary-light)]">
                          <span className="font-semibold text-[var(--flux-text-muted)]">{t("suggested")}: </span>
                          {a.suggestedAction}
                        </p>
                        {(a.suggestedActionModel || a.suggestedActionProvider) && (
                          <AiModelHint model={a.suggestedActionModel} provider={a.suggestedActionProvider} />
                        )}
                      </div>
                    ) : (
                      <p className="mt-1 text-[11px] leading-snug text-[var(--flux-text-muted)]">{a.message}</p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {a.boardId ? (
                        <Link
                          href={`/${locale}/board/${encodeURIComponent(a.boardId)}`}
                          className="text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-primary-light)] hover:underline"
                          onClick={() => setOpen(false)}
                        >
                          {t("openBoard")}
                        </Link>
                      ) : null}
                      {!a.read ? (
                        <span className="text-[10px] font-medium text-[var(--flux-warning)]">{t("unread")}</span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
