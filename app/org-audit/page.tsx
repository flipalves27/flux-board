"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { apiGet, ApiError } from "@/lib/api-client";
import { useAuth } from "@/context/auth-context";
import { Header } from "@/components/header";
import { isPlatformAdminSession, sessionCanManageOrgBilling } from "@/lib/rbac";

type AuditFilter = "all" | "invites";

type AuditEventRow = {
  id: string;
  at: string;
  action: string;
  resourceType: string;
  actorUserId?: string;
  actorName?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
};

export default function OrgAuditPage() {
  const router = useRouter();
  const { user, getHeaders, isChecked } = useAuth();
  const locale = useLocale();
  const tNav = useTranslations("navigation");
  const t = useTranslations("orgAudit");
  const localeRoot = `/${locale}`;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mongoConfigured, setMongoConfigured] = useState(true);
  const [filter, setFilter] = useState<AuditFilter>("invites");
  const [events, setEvents] = useState<AuditEventRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadMoreBusy, setLoadMoreBusy] = useState(false);

  const actionLabel = useCallback(
    (action: string) => {
      if (action === "org.invite_accepted") return t("actionInviteAccepted");
      if (action === "auth.login_success") return t("actionLoginSuccess");
      return action;
    },
    [t]
  );

  useEffect(() => {
    if (!isChecked || !user) {
      router.replace(`${localeRoot}/login`);
      return;
    }
    if (!sessionCanManageOrgBilling(user)) {
      router.replace(`${localeRoot}/boards`);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setEvents([]);
    setNextCursor(null);

    (async () => {
      try {
        const url = new URL("/api/organization-audit", window.location.origin);
        url.searchParams.set("limit", "40");
        url.searchParams.set("action", filter);
        const data = await apiGet<{
          events: AuditEventRow[];
          nextCursor: string | null;
          mongoConfigured?: boolean;
        }>(url.pathname + url.search, getHeaders());
        if (cancelled) return;
        setMongoConfigured(data.mongoConfigured !== false);
        setNextCursor(data.nextCursor);
        setEvents(data.events);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          router.replace(`${localeRoot}/login`);
          return;
        }
        setError(e instanceof ApiError ? e.message : t("loadError"));
        setEvents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isChecked, user, router, localeRoot, filter, getHeaders, t]);

  async function loadMore() {
    if (!nextCursor || loadMoreBusy) return;
    setLoadMoreBusy(true);
    try {
      const url = new URL("/api/organization-audit", window.location.origin);
      url.searchParams.set("limit", "40");
      url.searchParams.set("cursor", nextCursor);
      url.searchParams.set("action", filter);
      const data = await apiGet<{
        events: AuditEventRow[];
        nextCursor: string | null;
        mongoConfigured?: boolean;
      }>(url.pathname + url.search, getHeaders());
      setMongoConfigured(data.mongoConfigured !== false);
      setNextCursor(data.nextCursor);
      setEvents((prev) => [...prev, ...data.events]);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        router.replace(`${localeRoot}/login`);
        return;
      }
      setError(e instanceof ApiError ? e.message : t("loadError"));
    } finally {
      setLoadMoreBusy(false);
    }
  }

  const fmtTime = useMemo(() => {
    return (iso: string) => {
      try {
        return new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(iso));
      } catch {
        return iso;
      }
    };
  }, []);

  function metaLine(ev: AuditEventRow): string {
    const m = ev.metadata;
    if (!m || typeof m !== "object") return "—";
    const invited = m.invitedEmailLower;
    if (typeof invited === "string" && invited.trim()) {
      return t("metaInvitedEmail", { email: invited.trim() });
    }
    return "—";
  }

  return (
    <div className="min-h-screen">
      <Header title={tNav("orgAudit")} backHref={`${localeRoot}/boards`} backLabel="← Boards">
        <div className="text-xs text-[var(--flux-text-muted)]">{t("subtitle")}</div>
      </Header>
      <main className="max-w-[980px] mx-auto px-6 py-10">
        <div className="rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] p-6 shadow-[var(--flux-shadow-elevated-card)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
            <h2 className="font-display font-bold text-xl text-[var(--flux-text)]">{t("title")}</h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={`btn-sm ${filter === "invites" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setFilter("invites")}
              >
                {t("filterInvites")}
              </button>
              <button
                type="button"
                className={`btn-sm ${filter === "all" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setFilter("all")}
              >
                {t("filterAll")}
              </button>
            </div>
          </div>

          <p className="text-sm text-[var(--flux-text-muted)] mb-4">
            <Link href={`${localeRoot}/org-invites`} className="text-[var(--flux-primary-light)] underline hover:opacity-90">
              {t("linkInvites")}
            </Link>
          </p>

          {user && isPlatformAdminSession(user) && !mongoConfigured && (
            <div className="mb-4 rounded-[var(--flux-rad)] border border-[var(--flux-warning-alpha-30)] bg-[var(--flux-warning-alpha-08)] px-4 py-3 text-sm text-[var(--flux-text)]">
              {t("mongoDisabled")}
            </div>
          )}

          {error && (
            <div className="mb-4 bg-[var(--flux-danger-alpha-12)] border border-[var(--flux-danger-alpha-30)] text-[var(--flux-danger)] p-3 rounded-[var(--flux-rad)] text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-[var(--flux-text-muted)]">{t("loading")}</p>
          ) : events.length === 0 ? (
            <p className="text-[var(--flux-text-muted)]">{t("empty")}</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse min-w-[640px]">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-[var(--flux-text-muted)] bg-[var(--flux-surface-elevated)]">
                        {t("colWhen")}
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-[var(--flux-text-muted)] bg-[var(--flux-surface-elevated)]">
                        {t("colEvent")}
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-[var(--flux-text-muted)] bg-[var(--flux-surface-elevated)]">
                        {t("colActor")}
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-[var(--flux-text-muted)] bg-[var(--flux-surface-elevated)]">
                        {t("colDetail")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((ev) => (
                      <tr key={ev.id} className="border-b border-[var(--flux-chrome-alpha-06)]">
                        <td className="px-3 py-2 text-sm text-[var(--flux-text-muted)] whitespace-nowrap">
                          {fmtTime(ev.at)}
                        </td>
                        <td className="px-3 py-2 text-sm text-[var(--flux-text)]">{actionLabel(ev.action)}</td>
                        <td className="px-3 py-2 text-sm text-[var(--flux-text-muted)]">
                          {ev.actorName ? (
                            <span>
                              {ev.actorName}
                              {ev.actorUserId ? (
                                <span className="block text-[11px] font-mono opacity-80">{ev.actorUserId}</span>
                              ) : null}
                            </span>
                          ) : ev.actorUserId ? (
                            <span className="font-mono text-xs">{ev.actorUserId}</span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2 text-sm text-[var(--flux-text-muted)] break-words max-w-[280px]">
                          {metaLine(ev)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {nextCursor ? (
                <div className="mt-4">
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    disabled={loadMoreBusy}
                    onClick={() => void loadMore()}
                  >
                    {loadMoreBusy ? t("loading") : t("loadMore")}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
