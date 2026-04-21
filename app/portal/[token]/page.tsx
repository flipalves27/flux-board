"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { PublicPortalPayload } from "@/lib/portal-public";
import { FluxAppBackdrop } from "@/components/ui/flux-app-backdrop";

type ApiLocked = {
  locked: true;
  passwordProtected: true;
  preview: {
    boardName: string;
    clientLabel?: string;
    branding: PublicPortalPayload["branding"];
    displayTitle: string;
    platformName?: string;
  };
};

type ApiOpen = {
  locked: false;
  passwordProtected: boolean;
  payload: PublicPortalPayload;
};

export default function PublicPortalPage() {
  const params = useParams();
  const token = String(params.token || "");
  const t = useTranslations("portal");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState<ApiLocked | null>(null);
  const [data, setData] = useState<PublicPortalPayload | null>(null);
  const [password, setPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/portal/${encodeURIComponent(token)}`, { cache: "no-store", credentials: "include" });
      const body = (await r.json().catch(() => ({}))) as ApiLocked | ApiOpen | { error?: string };
      if (!r.ok) throw new Error(String((body as { error?: string }).error || t("notFound")));
      if ((body as ApiLocked).locked) {
        setLocked(body as ApiLocked);
        setData(null);
      } else {
        setLocked(null);
        setData((body as ApiOpen).payload);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("notFound"));
      setLocked(null);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    if (token) void load();
  }, [token, load]);

  const cssVars = useMemo(() => {
    const b = locked?.preview.branding || data?.branding;
    if (!b) return undefined;
    return {
      ["--portal-primary" as string]: b.primaryColor || "var(--flux-primary)",
      ["--portal-secondary" as string]: b.secondaryColor || "var(--flux-secondary)",
      ["--portal-accent" as string]: b.accentColor || "var(--flux-accent)",
    } as React.CSSProperties;
  }, [locked, data]);

  const footerBrand = locked?.preview.platformName || data?.platformName || "Flux-Board";

  const columnsWithCards = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, PublicPortalPayload["cards"]>();
    for (const b of data.bucketOrder) {
      map.set(b.key, []);
    }
    for (const c of data.cards) {
      const list = map.get(c.bucket);
      if (list) list.push(c);
    }
    return data.bucketOrder.map((b) => ({ bucket: b, cards: map.get(b.key) || [] }));
  }, [data]);

  async function onUnlock(e: FormEvent) {
    e.preventDefault();
    setUnlocking(true);
    setUnlockError(null);
    try {
      const r = await fetch(`/api/portal/${encodeURIComponent(token)}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(String(body.error || t("passwordError")));
      setPassword("");
      await load();
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : t("passwordError"));
    } finally {
      setUnlocking(false);
    }
  }

  if (loading) {
    return (
      <div
        className="relative flex min-h-[100dvh] items-center justify-center overflow-x-hidden px-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pt-[max(1rem,env(safe-area-inset-top,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))]"
        style={cssVars}
      >
        <FluxAppBackdrop />
        <p className="relative z-[1] text-[var(--flux-text-muted)]">{t("loading")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="relative flex min-h-[100dvh] items-center justify-center overflow-x-hidden px-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] py-8">
        <FluxAppBackdrop />
        <p className="relative z-[1] text-[var(--flux-danger)] text-center max-w-md">{error}</p>
      </div>
    );
  }

  if (locked) {
    const { preview } = locked;
    const logo = preview.branding.logoUrl;
    return (
      <div
        className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-x-hidden px-[max(1rem,env(safe-area-inset-left,0px))] py-12 pr-[max(1rem,env(safe-area-inset-right,0px))] pt-[max(1rem,env(safe-area-inset-top,0px))] pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]"
        style={cssVars}
      >
        <FluxAppBackdrop />
        <div className="relative z-[1] w-full max-w-md rounded-[var(--flux-rad-lg)] border border-[var(--flux-primary-alpha-25)] bg-[var(--flux-surface-card)] p-8 shadow-[var(--shadow-md)]">
          <div className="flex flex-col items-center gap-3 text-center mb-6">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="max-h-14 object-contain" />
            ) : null}
            <h1 className="text-xl font-semibold font-display text-[var(--flux-text)]">{preview.displayTitle}</h1>
            {preview.clientLabel ? (
              <p className="text-sm text-[var(--flux-text-muted)]">
                {t("clientLabel")}: {preview.clientLabel}
              </p>
            ) : null}
          </div>
          <form onSubmit={onUnlock} className="space-y-4">
            <div>
              <label htmlFor="portal-pw" className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1">
                {t("passwordLabel")}
              </label>
              <input
                id="portal-pw"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="min-h-11 w-full rounded-[var(--flux-rad)] border border-[var(--flux-portal-chrome-35)] bg-[var(--flux-surface-mid)] px-3 py-2 text-sm text-[var(--flux-text)]"
              />
            </div>
            {unlockError ? <p className="text-sm text-[var(--flux-danger)]">{unlockError}</p> : null}
            <button
              type="submit"
              disabled={unlocking || !password.trim()}
              className="btn-primary min-h-11 w-full py-2.5"
              style={{ background: "var(--portal-primary, var(--flux-primary))" }}
            >
              {unlocking ? "…" : t("unlock")}
            </button>
          </form>
          <p className="mt-6 text-center text-[10px] text-[var(--flux-text-muted)] uppercase tracking-wider">{t("readOnly")}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const title = data.branding.title || data.boardName;
  const logo = data.branding.logoUrl;

  return (
    <div
      className="relative min-h-[100dvh] overflow-x-hidden pb-[max(4rem,calc(env(safe-area-inset-bottom,0px)+3rem))]"
      style={cssVars}
    >
      <FluxAppBackdrop />
      <div className="relative z-[1]">
      <header className="border-b border-[var(--flux-portal-chrome-15)] bg-[var(--flux-surface-mid)]/80 backdrop-blur-sm pt-[env(safe-area-inset-top,0px)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-[max(1rem,env(safe-area-inset-left,0px))] py-6 pr-[max(1rem,env(safe-area-inset-right,0px))] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4 min-w-0">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="h-10 w-auto max-w-[160px] object-contain shrink-0" />
            ) : null}
            <div className="min-w-0">
              <h1 className="text-xl font-semibold font-display text-[var(--flux-text)] truncate">{title}</h1>
              {data.clientLabel ? (
                <p className="text-sm text-[var(--flux-text-muted)] truncate">
                  {t("clientLabel")}: {data.clientLabel}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <MetricPill
              label={t("metrics.total")}
              value={data.metrics.total}
              accent="var(--portal-primary, var(--flux-primary))"
            />
            <MetricPill
              label={t("metrics.completed")}
              value={data.metrics.completed}
              accent="var(--portal-secondary, var(--flux-secondary))"
            />
            <MetricPill
              label={t("metrics.pct")}
              value={`${data.metrics.completionPercent}%`}
              accent="var(--portal-accent, var(--flux-accent))"
            />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-[max(1rem,env(safe-area-inset-left,0px))] py-8 pr-[max(1rem,env(safe-area-inset-right,0px))]">
        {data.cards.length === 0 ? (
          <p className="text-center text-[var(--flux-text-muted)] py-16">{t("noCards")}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {columnsWithCards.map(({ bucket, cards }) => (
              <section
                key={bucket.key}
                className="rounded-[var(--flux-rad-lg)] border border-[var(--flux-portal-chrome-18)] bg-[var(--flux-surface-card)] flex flex-col min-h-[120px]"
              >
                <div
                  className="px-3 py-2 border-b border-[var(--flux-portal-chrome-12)] rounded-t-[var(--flux-rad-lg)]"
                  style={{ borderLeftWidth: 4, borderLeftColor: bucket.color }}
                >
                  <h2 className="text-sm font-semibold text-[var(--flux-text)]">{bucket.label}</h2>
                </div>
                <ul className="p-2 flex flex-col gap-2">
                  {cards.length === 0 ? (
                    <li className="text-xs text-[var(--flux-text-muted)] px-2 py-3 text-center">—</li>
                  ) : (
                    cards.map((c) => (
                      <li
                        key={c.id}
                        className="rounded-[var(--flux-rad)] bg-[var(--flux-surface-elevated)]/80 px-3 py-2 border border-[var(--flux-portal-chrome-10)]"
                      >
                        <p className="text-sm font-medium text-[var(--flux-text)]">{c.title}</p>
                        <div className="mt-1 flex flex-wrap gap-1.5 text-[10px]">
                          <span className="px-1.5 py-0.5 rounded bg-[var(--flux-surface-mid)] text-[var(--flux-text-muted)]">
                            {c.progress}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-[var(--flux-surface-mid)] text-[var(--flux-text-muted)]">
                            {c.priority}
                          </span>
                          {c.dueDate ? (
                            <span className="px-1.5 py-0.5 rounded text-[var(--flux-warning)]">{c.dueDate}</span>
                          ) : null}
                        </div>
                        {c.desc ? (
                          <p className="mt-2 text-xs text-[var(--flux-text-muted)] line-clamp-4 whitespace-pre-wrap">{c.desc}</p>
                        ) : null}
                      </li>
                    ))
                  )}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      <footer className="fixed bottom-0 left-0 right-0 z-[2] border-t border-[var(--flux-portal-chrome-10)] bg-[var(--flux-surface-dark)]/90 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)] text-center text-[10px] text-[var(--flux-text-muted)]">
        {t("readOnly")} · {footerBrand}
      </footer>
      </div>
    </div>
  );
}

function MetricPill({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div
      className="flex min-h-11 min-w-[100px] flex-col justify-center rounded-[var(--flux-rad)] border border-[var(--flux-portal-chrome-20)] bg-[var(--flux-surface-card)] px-3 py-2"
      style={{ boxShadow: `0 0 0 1px ${accent}22` }}
    >
      <p className="text-[10px] uppercase tracking-wider text-[var(--flux-text-muted)]">{label}</p>
      <p className="text-lg font-semibold font-display" style={{ color: accent }}>
        {value}
      </p>
    </div>
  );
}
