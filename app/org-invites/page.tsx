"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { useAuth } from "@/context/auth-context";
import { Header } from "@/components/header";
import { useToast } from "@/context/toast-context";
import { sessionCanManageOrgBilling } from "@/lib/rbac";
import { ORG_INVITES_POLL_INTERVAL_MS } from "@/lib/org-invites-poll-ms";

type OrgInviteRole = "gestor" | "membro" | "convidado";

type InviteRow = {
  _id: string;
  orgId: string;
  emailLower: string;
  assignedOrgRole: OrgInviteRole;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  usedByUserId?: string;
  usedByName?: string | null;
  usedByEmail?: string | null;
};

function formatDateShort(iso?: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    return iso;
  }
}

export default function OrgInvitesPage() {
  const router = useRouter();
  const { user, getHeaders, isChecked } = useAuth();
  const locale = useLocale();
  const tNav = useTranslations("navigation");
  const t = useTranslations("orgInvites");
  const localeRoot = `/${locale}`;
  const { pushToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [inviteOrgRole, setInviteOrgRole] = useState<OrgInviteRole>("membro");
  const [assignableRoles, setAssignableRoles] = useState<OrgInviteRole[]>(["membro", "convidado"]);
  const [invites, setInvites] = useState<InviteRow[]>([]);

  const [filter, setFilter] = useState<"active" | "used" | "expired" | "all">("active");

  const [lastInviteCode, setLastInviteCode] = useState<string | null>(null);
  const inviteUrl = useMemo(() => {
    if (!lastInviteCode) return null;
    if (typeof window === "undefined") return null;
    return `${window.location.origin}${localeRoot}/login?invite=${encodeURIComponent(lastInviteCode)}`;
  }, [lastInviteCode, localeRoot]);

  const roleLabel = useCallback(
    (r: OrgInviteRole) =>
      r === "gestor" ? t("roleGestor") : r === "convidado" ? t("roleConvidado") : t("roleMembro"),
    [t]
  );

  const fetchInvites = useCallback(
    async (mode: "normal" | "silent") => {
      if (mode === "normal") {
        setLoading(true);
        setError(null);
      }
      try {
        const data = await apiGet<{ invites: InviteRow[]; assignableRoles?: OrgInviteRole[] }>(
          "/api/organization-invites",
          getHeaders()
        );
        setInvites(data.invites ?? []);
        const ar = data.assignableRoles?.filter((r): r is OrgInviteRole =>
          r === "gestor" || r === "membro" || r === "convidado"
        );
        if (ar?.length) {
          setAssignableRoles(ar);
          setInviteOrgRole((prev) => (ar.includes(prev) ? prev : ar[0]!));
        }
        if (mode === "normal") setError(null);
      } catch (e) {
        if (mode === "silent") return;
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          router.replace(`${localeRoot}/login`);
          return;
        }
        setError(e instanceof ApiError ? e.message : t("loadError"));
      } finally {
        if (mode === "normal") setLoading(false);
      }
    },
    [getHeaders, router, localeRoot, t]
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
    void fetchInvites("normal");
  }, [isChecked, user, router, localeRoot, fetchInvites]);

  useEffect(() => {
    if (!isChecked || !user || !sessionCanManageOrgBilling(user)) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void fetchInvites("silent");
    }, ORG_INVITES_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isChecked, user, fetchInvites]);

  async function createInvite() {
    if (!email.trim() || !email.includes("@")) {
      setError(t("invalidEmail"));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const data = await apiPost<{ invite: { code: string } }>(
        "/api/organization-invites",
        { email, orgRole: inviteOrgRole },
        getHeaders()
      );
      const code = (data as { invite?: { code: string } })?.invite?.code;
      if (!code) throw new Error(t("createFailed"));
      setLastInviteCode(code);
      pushToast({ kind: "success", title: t("inviteCreated") });
      await fetchInvites("silent");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : t("createFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function expireInvite(code: string) {
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/organization-invites/${encodeURIComponent(code)}/expire`, {}, getHeaders());
      pushToast({ kind: "info", title: t("inviteExpired") });
      if (lastInviteCode === code) setLastInviteCode(null);
      await fetchInvites("silent");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : t("expireFailed"));
    } finally {
      setBusy(false);
    }
  }

  const filterCounts = useMemo(() => {
    const now = Date.now();
    let active = 0;
    let used = 0;
    let expired = 0;
    for (const inv of invites) {
      const isExpired = new Date(inv.expiresAt).getTime() <= now;
      const isUsed = Boolean(inv.usedAt);
      if (isUsed) used++;
      else if (isExpired) expired++;
      else active++;
    }
    return { active, used, expired, all: invites.length };
  }, [invites]);

  const filteredInvites = useMemo(() => {
    const now = Date.now();
    if (filter === "all") return invites;
    return invites.filter((inv) => {
      const expired = new Date(inv.expiresAt).getTime() <= now;
      const used = Boolean(inv.usedAt);
      if (filter === "used") return used;
      if (filter === "expired") return !used && expired;
      return !used && !expired;
    });
  }, [invites, filter]);

  function memberSummary(inv: InviteRow): string {
    if (!inv.usedAt) return "—";
    if (inv.usedByName?.trim() && inv.usedByEmail?.trim()) {
      return t("memberLine", { name: inv.usedByName.trim(), email: inv.usedByEmail.trim() });
    }
    return t("memberUnknown", { id: inv.usedByUserId ?? "—" });
  }

  return (
    <div className="min-h-screen">
      <Header title={tNav("invites")} backHref={`${localeRoot}/boards`} backLabel="← Boards">
        <div className="space-y-1">
          <div className="text-xs text-[var(--flux-text-muted)]">{t("subtitle")}</div>
          <Link
            href={`${localeRoot}/org-audit`}
            className="inline-block text-xs text-[var(--flux-primary-light)] underline hover:opacity-90"
          >
            {t("auditLogLink")}
          </Link>
        </div>
      </Header>
      <main className="max-w-[980px] mx-auto px-6 py-10">
        <div className="rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] p-6 shadow-[var(--flux-shadow-elevated-card)]">
          <h2 className="font-display font-bold text-xl text-[var(--flux-text)] mb-1">{tNav("invites")}</h2>

          {error && (
            <div className="mb-4 bg-[var(--flux-danger-alpha-12)] border border-[var(--flux-danger-alpha-30)] text-[var(--flux-danger)] p-3 rounded-[var(--flux-rad)] text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-[1fr_160px_auto] gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">
                {t("guestEmail")}
              </label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-[var(--flux-chrome-alpha-12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                disabled={busy}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">
                {t("orgLevel")}
              </label>
              <select
                value={inviteOrgRole}
                onChange={(e) => setInviteOrgRole(e.target.value as OrgInviteRole)}
                className="w-full px-3 py-2 border border-[var(--flux-chrome-alpha-12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                disabled={busy || assignableRoles.length === 0}
              >
                {assignableRoles.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn-primary" type="button" disabled={busy} onClick={createInvite}>
              {busy ? t("generating") : t("generate")}
            </button>
          </div>

          {inviteUrl && (
            <div className="mt-6 p-4 rounded-[var(--flux-rad)] border border-[var(--flux-secondary-alpha-28)] bg-[var(--flux-secondary-alpha-08)]">
              <p className="text-xs font-semibold text-[var(--flux-text-muted)] uppercase tracking-wide">
                {t("inviteLink")}
              </p>
              <div className="mt-2 flex flex-col gap-2">
                <code className="break-all text-[12px] text-[var(--flux-text)]">{inviteUrl}</code>
                <button
                  type="button"
                  className="btn-secondary w-fit"
                  disabled={busy}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(inviteUrl);
                      pushToast({ kind: "success", title: t("linkCopied") });
                    } catch {
                      // ignore
                    }
                  }}
                >
                  {t("copy")}
                </button>
              </div>
            </div>
          )}

          <div className="mt-8">
            {loading ? (
              <p className="text-[var(--flux-text-muted)]">{t("loading")}</p>
            ) : filteredInvites.length === 0 ? (
              <p className="text-[var(--flux-text-muted)]">{t("empty")}</p>
            ) : (
              <div className="overflow-x-auto">
                <div className="mb-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setFilter("active")}
                    className={`btn-sm ${filter === "active" ? "btn-primary" : "btn-secondary"}`}
                  >
                    {t("filterActive", { count: filterCounts.active })}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilter("used")}
                    className={`btn-sm ${filter === "used" ? "btn-primary" : "btn-secondary"}`}
                  >
                    {t("filterUsed", { count: filterCounts.used })}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilter("expired")}
                    className={`btn-sm ${filter === "expired" ? "btn-primary" : "btn-secondary"}`}
                  >
                    {t("filterExpired", { count: filterCounts.expired })}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilter("all")}
                    className={`btn-sm ${filter === "all" ? "btn-primary" : "btn-secondary"}`}
                  >
                    {t("filterAll", { count: filterCounts.all })}
                  </button>
                </div>
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 bg-[var(--flux-surface-elevated)] font-display text-xs font-bold text-[var(--flux-text-muted)] uppercase tracking-wide text-left">
                        {t("colEmail")}
                      </th>
                      <th className="px-4 py-3 bg-[var(--flux-surface-elevated)] font-display text-xs font-bold text-[var(--flux-text-muted)] uppercase tracking-wide text-left">
                        {t("colLevel")}
                      </th>
                      <th className="px-4 py-3 bg-[var(--flux-surface-elevated)] font-display text-xs font-bold text-[var(--flux-text-muted)] uppercase tracking-wide text-left">
                        {t("colExpires")}
                      </th>
                      <th className="px-4 py-3 bg-[var(--flux-surface-elevated)] font-display text-xs font-bold text-[var(--flux-text-muted)] uppercase tracking-wide text-left">
                        {t("colActivated")}
                      </th>
                      <th className="px-4 py-3 bg-[var(--flux-surface-elevated)] font-display text-xs font-bold text-[var(--flux-text-muted)] uppercase tracking-wide text-left">
                        {t("colMember")}
                      </th>
                      <th className="px-4 py-3 bg-[var(--flux-surface-elevated)] font-display text-xs font-bold text-[var(--flux-text-muted)] uppercase tracking-wide text-left">
                        {t("colStatus")}
                      </th>
                      <th className="px-4 py-3 bg-[var(--flux-surface-elevated)] font-display text-xs font-bold text-[var(--flux-text-muted)] uppercase tracking-wide text-left">
                        {t("colActions")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInvites.map((inv) => {
                      const expired = new Date(inv.expiresAt).getTime() <= Date.now();
                      const used = Boolean(inv.usedAt);
                      const statusLabel = used
                        ? t("statusUsed")
                        : expired
                          ? t("statusExpired")
                          : t("statusActive");
                      const canExpire = !used && !expired;
                      return (
                        <tr key={inv._id} className="border-b border-[var(--flux-chrome-alpha-06)]">
                          <td className="px-4 py-3 text-[var(--flux-text-muted)]">{inv.emailLower}</td>
                          <td className="px-4 py-3 text-[var(--flux-text-muted)] text-sm">
                            {roleLabel(inv.assignedOrgRole ?? "membro")}
                          </td>
                          <td className="px-4 py-3 text-[var(--flux-text-muted)]">{formatDateShort(inv.expiresAt)}</td>
                          <td className="px-4 py-3 text-[var(--flux-text-muted)] text-sm">
                            {used ? formatDateShort(inv.usedAt) : "—"}
                          </td>
                          <td className="px-4 py-3 text-[var(--flux-text-muted)] text-sm max-w-[220px]">
                            <span className="break-words">{memberSummary(inv)}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                                used
                                  ? "bg-[var(--flux-secondary-alpha-18)] text-[var(--flux-secondary)]"
                                  : expired
                                    ? "bg-[var(--flux-danger-alpha-12)] text-[var(--flux-danger)]"
                                    : "bg-[var(--flux-primary-alpha-14)] text-[var(--flux-primary-light)]"
                              }`}
                            >
                              {statusLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {canExpire ? (
                              <button
                                type="button"
                                className="btn-sm border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)] hover:bg-[var(--flux-primary-alpha-10)] hover:border-[var(--flux-danger)] hover:text-[var(--flux-danger)]"
                                onClick={() => expireInvite(inv._id)}
                                disabled={busy}
                              >
                                {t("expire")}
                              </button>
                            ) : (
                              <span className="text-xs text-[var(--flux-text-muted)]">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
