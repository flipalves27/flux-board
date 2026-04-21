"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { Header } from "@/components/header";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut, ApiError } from "@/lib/api-client";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/context/toast-context";
import { DEFAULT_ORG_ID } from "@/lib/org-constants";
import { isPlatformAdminSession } from "@/lib/rbac";

type Tab = "organizations" | "users" | "audit" | "operations";

type OrgRow = {
  _id: string;
  name: string;
  slug: string;
  plan: "free" | "trial" | "pro" | "business";
  memberCount: number;
  maxUsers?: number;
  maxBoards?: number;
};

type UserRow = {
  id: string;
  username: string;
  name: string;
  email: string;
  orgId: string;
  isAdmin: boolean;
  orgRole?: "gestor" | "membro" | "convidado";
  platformRole?: "platform_admin" | "platform_user";
};

type AuditRow = {
  id: string;
  at: string;
  action: string;
  resourceType: string;
  actorUserId?: string;
  resourceId?: string;
  orgId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
};

type OpsPayload = {
  pushOutbox: {
    total: number;
    dueNow: number;
    items: Array<{ _id: string; orgId: string; userId: string; endpoint: string; attemptCount: number; nextAttemptAt: string }>;
  };
  integrationLogs: {
    total: number;
    synced: number;
    failed: number;
    items: Array<{ _id: string; orgId: string; provider: string; eventType: string; status?: string; message?: string | null; receivedAt: string }>;
  };
  publicApiTokens: {
    total: number;
    active: number;
    items: Array<{ id: string; name: string; orgId: string; keyPrefix: string; scopes: string[]; active: boolean; updatedAt: string }>;
  };
};

export default function PlatformAdminConsolePage() {
  const router = useRouter();
  const t = useTranslations("platformAdmin");
  const { user, getHeaders, isChecked, refreshSession } = useAuth();
  const { pushToast } = useToast();

  const [tab, setTab] = useState<Tab>("users");
  const [storageHint, setStorageHint] = useState<"mongo" | "kv" | null>(null);

  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [orgCursor, setOrgCursor] = useState<string | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [userCursor, setUserCursor] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [auditCursor, setAuditCursor] = useState<string | null>(null);
  const [ops, setOps] = useState<OpsPayload | null>(null);

  const [loading, setLoading] = useState(true);
  const [userFilter, setUserFilter] = useState("");
  const [orgFilter, setOrgFilter] = useState("");
  const [opsOrgFilter, setOpsOrgFilter] = useState("");
  const [opsProviderFilter, setOpsProviderFilter] = useState<"all" | "github" | "gitlab">("all");
  const [opsStatusFilter, setOpsStatusFilter] = useState<"all" | "received" | "synced" | "ignored" | "failed">("all");
  const [opsTokenFilter, setOpsTokenFilter] = useState<"all" | "active" | "revoked">("all");

  const [editOrg, setEditOrg] = useState<OrgRow | null>(null);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [newUserOpen, setNewUserOpen] = useState(false);
  const [formOrg, setFormOrg] = useState({
    name: "",
    slug: "",
    plan: "free" as OrgRow["plan"],
    maxUsers: 10,
    maxBoards: 100,
  });
  const [formUser, setFormUser] = useState({
    name: "",
    email: "",
    password: "",
    orgRole: "membro" as "gestor" | "membro" | "convidado",
    orgId: "",
    platformRole: "platform_user" as "platform_admin" | "platform_user",
  });
  const [newUserForm, setNewUserForm] = useState({
    name: "",
    email: "",
    password: "",
    orgRole: "membro" as "gestor" | "membro" | "convidado",
    orgId: "",
  });
  const [formError, setFormError] = useState("");
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<UserRow | null>(null);
  const [confirmDeleteOrg, setConfirmDeleteOrg] = useState<OrgRow | null>(null);
  const pendingDeleteUserRef = useRef<UserRow | null>(null);
  const deleteUserInFlightRef = useRef(false);
  const [deleteUserBusy, setDeleteUserBusy] = useState(false);

  const loadOrgs = useCallback(
    async (reset: boolean) => {
      try {
        const q = orgFilter.trim();
        const url = new URL("/api/admin/platform-organizations", window.location.origin);
        url.searchParams.set("limit", "40");
        if (!reset && orgCursor) url.searchParams.set("cursor", orgCursor);
        if (q) url.searchParams.set("q", q);
        const data = await apiGet<{
          organizations: OrgRow[];
          nextCursor: string | null;
          storage: "mongo" | "kv";
        }>(url.pathname + url.search, getHeaders());
        setStorageHint(data.storage);
        setOrgCursor(data.nextCursor);
        setOrgs((prev) => (reset ? data.organizations : [...prev, ...data.organizations]));
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          router.replace("/boards");
          return;
        }
        pushToast({
          kind: "error",
          title: t("loadError"),
          description: e instanceof Error ? e.message : "—",
        });
      }
    },
    [getHeaders, orgFilter, orgCursor, pushToast, router, t]
  );

  const loadUsers = useCallback(
    async (reset: boolean) => {
      try {
        const q = userFilter.trim();
        const url = new URL("/api/admin/platform-users", window.location.origin);
        url.searchParams.set("limit", "40");
        if (!reset && userCursor) url.searchParams.set("cursor", userCursor);
        if (q) url.searchParams.set("q", q);
        const data = await apiGet<{
          users: UserRow[];
          nextCursor: string | null;
          storage: "mongo" | "kv";
        }>(url.pathname + url.search, getHeaders());
        setStorageHint(data.storage);
        setUserCursor(data.nextCursor);
        setUsers((prev) => (reset ? data.users : [...prev, ...data.users]));
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          router.replace("/boards");
          return;
        }
        pushToast({
          kind: "error",
          title: t("loadError"),
          description: e instanceof Error ? e.message : "—",
        });
      }
    },
    [getHeaders, userCursor, userFilter, pushToast, router, t]
  );

  const loadAudit = useCallback(
    async (reset: boolean) => {
      try {
        const url = new URL("/api/admin/audit", window.location.origin);
        url.searchParams.set("limit", "40");
        if (!reset && auditCursor) url.searchParams.set("cursor", auditCursor);
        const data = await apiGet<{ events: AuditRow[]; nextCursor: string | null }>(
          url.pathname + url.search,
          getHeaders()
        );
        setAuditCursor(data.nextCursor);
        setAudit((prev) => (reset ? data.events : [...prev, ...data.events]));
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          router.replace("/boards");
          return;
        }
        pushToast({
          kind: "error",
          title: t("loadError"),
          description: e instanceof Error ? e.message : "—",
        });
      }
    },
    [auditCursor, getHeaders, pushToast, router, t]
  );

  const loadOps = useCallback(async () => {
    try {
      const url = new URL("/api/admin/operations", window.location.origin);
      url.searchParams.set("limit", "80");
      if (opsOrgFilter.trim()) url.searchParams.set("orgId", opsOrgFilter.trim());
      if (opsProviderFilter !== "all") url.searchParams.set("provider", opsProviderFilter);
      if (opsStatusFilter !== "all") url.searchParams.set("status", opsStatusFilter);
      if (opsTokenFilter !== "all") url.searchParams.set("tokenState", opsTokenFilter);
      const data = await apiGet<OpsPayload>(url.pathname + url.search, getHeaders());
      setOps(data);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        router.replace("/boards");
        return;
      }
      pushToast({
        kind: "error",
        title: t("loadError"),
        description: e instanceof Error ? e.message : "—",
      });
    }
  }, [getHeaders, opsOrgFilter, opsProviderFilter, opsStatusFilter, opsTokenFilter, pushToast, router, t]);

  const downloadCsv = useCallback((filename: string, columns: string[], rows: string[][]) => {
    const esc = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const csv = [columns.map(esc).join(","), ...rows.map((row) => row.map(esc).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  }, []);

  useEffect(() => {
    if (!isChecked || !user) {
      router.replace("/login");
      return;
    }
    if (!isPlatformAdminSession(user)) {
      router.replace("/boards");
      return;
    }
    setLoading(true);
    void (async () => {
      if (tab === "organizations") {
        setOrgCursor(null);
        setOrgs([]);
        await loadOrgs(true);
      } else if (tab === "users") {
        setUserCursor(null);
        setUsers([]);
        await loadUsers(true);
      } else if (tab === "operations") {
        setOps(null);
        await loadOps();
      } else {
        setAuditCursor(null);
        setAudit([]);
        await loadAudit(true);
      }
      setLoading(false);
    })();
  }, [isChecked, user, router, tab]);

  function openEditOrg(o: OrgRow) {
    setFormOrg({
      name: o.name,
      slug: o.slug,
      plan: o.plan,
      maxUsers: o.maxUsers ?? 10,
      maxBoards: o.maxBoards ?? 100,
    });
    setEditOrg(o);
    setFormError("");
  }

  async function saveOrg() {
    if (!editOrg) return;
    setFormError("");
    try {
      await apiPatch(
        `/api/admin/platform-organizations/${editOrg._id}`,
        {
          name: formOrg.name.trim(),
          slug: formOrg.slug.trim(),
          plan: formOrg.plan,
          maxUsers: formOrg.maxUsers,
          maxBoards: formOrg.maxBoards,
        },
        getHeaders()
      );
      setEditOrg(null);
      setOrgCursor(null);
      setOrgs([]);
      await loadOrgs(true);
      pushToast({ kind: "success", title: t("saved") });
    } catch (e) {
      setFormError(e instanceof ApiError ? (e.data as { error?: string })?.error ?? e.message : "Erro");
    }
  }

  function openEditUser(u: UserRow) {
    setFormUser({
      name: u.name,
      email: u.email,
      password: "",
      orgRole: u.orgRole === "gestor" || u.orgRole === "convidado" ? u.orgRole : "membro",
      orgId: u.orgId,
      platformRole: u.platformRole ?? "platform_user",
    });
    setEditUser(u);
    setFormError("");
  }

  async function saveUser() {
    if (!editUser) return;
    setFormError("");
    const body: Record<string, unknown> = {
      name: formUser.name.trim(),
      email: formUser.email.trim(),
      orgRole: formUser.orgRole,
      platformRole: formUser.platformRole,
    };
    if (formUser.password.length >= 8) body.password = formUser.password;
    if (formUser.orgId !== editUser.orgId) body.orgId = formUser.orgId;
    try {
      await apiPut(`/api/users/${editUser.id}`, body, getHeaders());
      setEditUser(null);
      if (editUser.id === user?.id) await refreshSession();
      setUserCursor(null);
      setUsers([]);
      await loadUsers(true);
      pushToast({ kind: "success", title: t("saved") });
    } catch (e) {
      setFormError(e instanceof ApiError ? (e.data as { error?: string })?.error ?? e.message : "Erro");
    }
  }

  async function createUser() {
    setFormError("");
    if (!newUserForm.name.trim() || !newUserForm.email.trim() || !newUserForm.password || !newUserForm.orgId) {
      setFormError(t("fillRequired"));
      return;
    }
    if (newUserForm.password.length < 8) {
      setFormError(t("passwordMin"));
      return;
    }
    try {
      await apiPost(
        `/api/users?orgId=${encodeURIComponent(newUserForm.orgId)}`,
        {
          name: newUserForm.name.trim(),
          email: newUserForm.email.trim(),
          password: newUserForm.password,
          orgRole: newUserForm.orgRole,
        },
        getHeaders()
      );
      setNewUserOpen(false);
      setNewUserForm({ name: "", email: "", password: "", orgRole: "membro", orgId: "" });
      setUserCursor(null);
      setUsers([]);
      await loadUsers(true);
      pushToast({ kind: "success", title: t("userCreated") });
    } catch (e) {
      setFormError(e instanceof ApiError ? (e.data as { error?: string })?.error ?? e.message : "Erro");
    }
  }

  async function deleteOrgConfirmed(row: OrgRow) {
    try {
      await apiDelete(`/api/admin/platform-organizations/${encodeURIComponent(row._id)}`, getHeaders());
      setConfirmDeleteOrg(null);
      setOrgCursor(null);
      setOrgs([]);
      await loadOrgs(true);
      pushToast({ kind: "success", title: t("orgDeleted") });
    } catch (e) {
      pushToast({
        kind: "error",
        title: t("error"),
        description: e instanceof ApiError ? (e.data as { error?: string })?.error ?? e.message : "—",
      });
    }
  }

  async function deleteUserConfirmed(row: UserRow) {
    if (deleteUserInFlightRef.current) return;
    deleteUserInFlightRef.current = true;
    setDeleteUserBusy(true);
    const ac = new AbortController();
    const timeoutId = setTimeout(() => ac.abort(), 60_000);
    try {
      await apiDelete(`/api/users/${encodeURIComponent(row.id)}`, getHeaders(), { signal: ac.signal });
      setUsers((prev) => prev.filter((u) => u.id !== row.id));
      setUserCursor(null);
      setConfirmDeleteUser(null);
      pendingDeleteUserRef.current = null;
      pushToast({ kind: "success", title: t("userDeleted") });
    } catch (e) {
      const aborted =
        (typeof DOMException !== "undefined" && e instanceof DOMException && e.name === "AbortError") ||
        (e instanceof Error && e.name === "AbortError");
      pushToast({
        kind: "error",
        title: t("error"),
        description: aborted
          ? t("requestTimeout")
          : e instanceof ApiError
            ? (e.data as { error?: string })?.error ?? e.message
            : "—",
      });
    } finally {
      clearTimeout(timeoutId);
      deleteUserInFlightRef.current = false;
      setDeleteUserBusy(false);
    }
    void loadUsers(true).catch((e) => {
      pushToast({
        kind: "error",
        title: t("loadError"),
        description: e instanceof Error ? e.message : "—",
      });
    });
  }

  if (!user) return null;

  return (
    <div className="min-h-screen">
      <Header title={t("title")} backHref="/boards" />
      <main className="mx-auto max-w-[1100px] px-6 py-8">
        <p className="mb-6 text-sm text-[var(--flux-text-muted)]">{t("subtitle")}</p>

        {storageHint === "kv" && (
          <div className="mb-4 rounded-[var(--flux-rad)] border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-100">
            {t("kvWarning")}
          </div>
        )}

        <div className="mb-6 flex flex-wrap gap-2">
          {(["users", "organizations", "audit", "operations"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`rounded-[var(--flux-rad-sm)] px-4 py-2 text-sm font-semibold transition-colors ${
                tab === k
                  ? "bg-[var(--flux-primary)] text-white"
                  : "bg-[var(--flux-surface-card)] text-[var(--flux-text-muted)] hover:bg-[var(--flux-primary-alpha-10)]"
              }`}
            >
              {k === "users"
                ? t("tabUsers")
                : k === "organizations"
                  ? t("tabOrgs")
                  : k === "audit"
                    ? t("tabAudit")
                    : "Operations"}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-[var(--flux-text-muted)]">{t("loading")}</p>
        ) : tab === "users" ? (
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <input
                type="search"
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                placeholder={t("searchUsers")}
                className="min-w-[200px] flex-1 rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm text-[var(--flux-text)]"
              />
              <button
                type="button"
                className="btn-sm border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]"
                onClick={() => {
                  setUserCursor(null);
                  setUsers([]);
                  void loadUsers(true);
                }}
              >
                {t("applySearch")}
              </button>
              <button type="button" className="btn-primary" onClick={() => setNewUserOpen(true)}>
                {t("newUser")}
              </button>
            </div>
            <div className="overflow-hidden rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] shadow-[var(--shadow-md)]">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--flux-chrome-alpha-06)] bg-[var(--flux-surface-elevated)] text-xs font-bold uppercase tracking-wide text-[var(--flux-text-muted)]">
                    <th className="px-3 py-2">{t("colName")}</th>
                    <th className="px-3 py-2">{t("colEmail")}</th>
                    <th className="px-3 py-2">{t("colOrg")}</th>
                    <th className="px-3 py-2">{t("colRole")}</th>
                    <th className="px-3 py-2">{t("colPlatform")}</th>
                    <th className="px-3 py-2">{t("colActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr
                      key={u.id}
                      className="border-b border-[var(--flux-chrome-alpha-06)] hover:bg-[var(--flux-primary-alpha-06)]"
                    >
                      <td className="px-3 py-2 text-[var(--flux-text)]">{u.name}</td>
                      <td className="px-3 py-2 text-[var(--flux-text-muted)]">{u.email}</td>
                      <td className="px-3 py-2 font-mono text-xs text-[var(--flux-text-muted)]">{u.orgId}</td>
                      <td className="px-3 py-2">{u.orgRole ?? "—"}</td>
                      <td className="px-3 py-2">{u.platformRole ?? "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="btn-sm border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)] hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)]"
                            onClick={() => openEditUser(u)}
                          >
                            {t("edit")}
                          </button>
                          {u.id !== "admin" ? (
                            <button
                              type="button"
                              className="btn-sm border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] text-[var(--flux-danger)] hover:border-[var(--flux-danger)]"
                              onClick={() => {
                                pendingDeleteUserRef.current = u;
                                setConfirmDeleteUser(u);
                              }}
                            >
                              {t("delete")}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {userCursor ? (
              <button
                type="button"
                className="mt-4 text-sm font-semibold text-[var(--flux-primary)]"
                onClick={() => void loadUsers(false)}
              >
                {t("loadMore")}
              </button>
            ) : null}
          </div>
        ) : tab === "organizations" ? (
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <input
                type="search"
                value={orgFilter}
                onChange={(e) => setOrgFilter(e.target.value)}
                placeholder={t("searchOrgs")}
                className="min-w-[200px] rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm text-[var(--flux-text)]"
              />
              <button
                type="button"
                className="btn-sm border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]"
                onClick={() => {
                  setOrgCursor(null);
                  setOrgs([]);
                  void loadOrgs(true);
                }}
              >
                {t("applySearch")}
              </button>
            </div>
            <div className="overflow-hidden rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] shadow-[var(--shadow-md)]">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--flux-chrome-alpha-06)] bg-[var(--flux-surface-elevated)] text-xs font-bold uppercase tracking-wide text-[var(--flux-text-muted)]">
                    <th className="px-3 py-2">{t("colOrgName")}</th>
                    <th className="px-3 py-2">{t("colSlug")}</th>
                    <th className="px-3 py-2">{t("colPlan")}</th>
                    <th className="px-3 py-2">{t("colMembers")}</th>
                    <th className="px-3 py-2">{t("colActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.map((o) => (
                    <tr
                      key={o._id}
                      className="border-b border-[var(--flux-chrome-alpha-06)] hover:bg-[var(--flux-primary-alpha-06)]"
                    >
                      <td className="px-3 py-2 text-[var(--flux-text)]">{o.name}</td>
                      <td className="px-3 py-2 font-mono text-xs">{o.slug}</td>
                      <td className="px-3 py-2">{o.plan}</td>
                      <td className="px-3 py-2">{o.memberCount}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="btn-sm border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)] hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)]"
                            onClick={() => openEditOrg(o)}
                          >
                            {t("edit")}
                          </button>
                          {o._id !== DEFAULT_ORG_ID ? (
                            <button
                              type="button"
                              className="btn-sm border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] text-[var(--flux-danger)] hover:border-[var(--flux-danger)]"
                              onClick={() => setConfirmDeleteOrg(o)}
                            >
                              {t("delete")}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {orgCursor ? (
              <button
                type="button"
                className="mt-4 text-sm font-semibold text-[var(--flux-primary)]"
                onClick={() => void loadOrgs(false)}
              >
                {t("loadMore")}
              </button>
            ) : null}
          </div>
        ) : tab === "audit" ? (
          <div className="overflow-hidden rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] shadow-[var(--shadow-md)]">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--flux-chrome-alpha-06)] bg-[var(--flux-surface-elevated)] text-xs font-bold uppercase tracking-wide text-[var(--flux-text-muted)]">
                  <th className="px-3 py-2">{t("colWhen")}</th>
                  <th className="px-3 py-2">{t("colAction")}</th>
                  <th className="px-3 py-2">{t("colActor")}</th>
                  <th className="px-3 py-2">{t("colResource")}</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-[var(--flux-chrome-alpha-06)] hover:bg-[var(--flux-primary-alpha-06)]"
                  >
                    <td className="px-3 py-2 text-[var(--flux-text-muted)]">{a.at}</td>
                    <td className="px-3 py-2 font-mono text-xs">{a.action}</td>
                    <td className="px-3 py-2 font-mono text-xs">{a.actorUserId ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">
                      {a.resourceType} {a.resourceId ? `· ${a.resourceId}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {auditCursor ? (
              <button
                type="button"
                className="mt-4 text-sm font-semibold text-[var(--flux-primary)]"
                onClick={() => void loadAudit(false)}
              >
                {t("loadMore")}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={opsOrgFilter}
                onChange={(e) => setOpsOrgFilter(e.target.value)}
                placeholder="orgId"
                className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-xs text-[var(--flux-text)]"
              />
              <select
                value={opsProviderFilter}
                onChange={(e) => setOpsProviderFilter(e.target.value as "all" | "github" | "gitlab")}
                className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-xs text-[var(--flux-text)]"
              >
                <option value="all">provider: all</option>
                <option value="github">provider: github</option>
                <option value="gitlab">provider: gitlab</option>
              </select>
              <select
                value={opsStatusFilter}
                onChange={(e) =>
                  setOpsStatusFilter(e.target.value as "all" | "received" | "synced" | "ignored" | "failed")
                }
                className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-xs text-[var(--flux-text)]"
              >
                <option value="all">status: all</option>
                <option value="received">status: received</option>
                <option value="synced">status: synced</option>
                <option value="ignored">status: ignored</option>
                <option value="failed">status: failed</option>
              </select>
              <select
                value={opsTokenFilter}
                onChange={(e) => setOpsTokenFilter(e.target.value as "all" | "active" | "revoked")}
                className="rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-xs text-[var(--flux-text)]"
              >
                <option value="all">token: all</option>
                <option value="active">token: active</option>
                <option value="revoked">token: revoked</option>
              </select>
              <button
                type="button"
                className="btn-sm border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]"
                onClick={() => void loadOps()}
              >
                Atualizar
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] p-4">
                <p className="text-xs text-[var(--flux-text-muted)]">Push outbox</p>
                <p className="mt-1 text-lg font-semibold text-[var(--flux-text)]">
                  {ops?.pushOutbox.total ?? 0} · due {ops?.pushOutbox.dueNow ?? 0}
                </p>
              </div>
              <div className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] p-4">
                <p className="text-xs text-[var(--flux-text-muted)]">Integration logs</p>
                <p className="mt-1 text-lg font-semibold text-[var(--flux-text)]">
                  {ops?.integrationLogs.total ?? 0} · synced {ops?.integrationLogs.synced ?? 0}
                </p>
              </div>
              <div className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] p-4">
                <p className="text-xs text-[var(--flux-text-muted)]">Public API tokens</p>
                <p className="mt-1 text-lg font-semibold text-[var(--flux-text)]">
                  {ops?.publicApiTokens.active ?? 0}/{ops?.publicApiTokens.total ?? 0} ativos
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="overflow-hidden rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)]">
                <div className="flex items-center justify-between border-b border-[var(--flux-chrome-alpha-08)] px-3 py-2">
                  <span className="text-xs font-semibold uppercase text-[var(--flux-text-muted)]">Push outbox</span>
                  <button
                    type="button"
                    className="text-[10px] font-semibold text-[var(--flux-primary)]"
                    onClick={() =>
                      downloadCsv(
                        "push-outbox.csv",
                        ["id", "orgId", "userId", "endpoint", "attemptCount", "nextAttemptAt"],
                        (ops?.pushOutbox.items ?? []).map((x) => [
                          x._id,
                          x.orgId,
                          x.userId,
                          x.endpoint,
                          String(x.attemptCount),
                          x.nextAttemptAt,
                        ])
                      )
                    }
                  >
                    export CSV
                  </button>
                </div>
                <div className="max-h-72 overflow-auto">
                  {(ops?.pushOutbox.items ?? []).map((x) => (
                    <div key={x._id} className="border-b border-[var(--flux-chrome-alpha-06)] px-3 py-2 text-xs">
                      <div className="font-mono text-[var(--flux-text)]">{x.userId}</div>
                      <div className="text-[var(--flux-text-muted)]">attempt {x.attemptCount} · {x.nextAttemptAt}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="overflow-hidden rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)]">
                <div className="flex items-center justify-between border-b border-[var(--flux-chrome-alpha-08)] px-3 py-2">
                  <span className="text-xs font-semibold uppercase text-[var(--flux-text-muted)]">Integration logs</span>
                  <button
                    type="button"
                    className="text-[10px] font-semibold text-[var(--flux-primary)]"
                    onClick={() =>
                      downloadCsv(
                        "integration-logs.csv",
                        ["id", "orgId", "provider", "eventType", "status", "message", "receivedAt"],
                        (ops?.integrationLogs.items ?? []).map((x) => [
                          x._id,
                          x.orgId,
                          x.provider,
                          x.eventType,
                          x.status ?? "received",
                          x.message ?? "",
                          x.receivedAt,
                        ])
                      )
                    }
                  >
                    export CSV
                  </button>
                </div>
                <div className="max-h-72 overflow-auto">
                  {(ops?.integrationLogs.items ?? []).map((x) => (
                    <div key={x._id} className="border-b border-[var(--flux-chrome-alpha-06)] px-3 py-2 text-xs">
                      <div className="font-semibold text-[var(--flux-text)]">{x.provider} · {x.eventType}</div>
                      <div className="text-[var(--flux-text-muted)]">{x.status ?? "received"} · {x.receivedAt}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="overflow-hidden rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)]">
              <div className="flex items-center justify-between border-b border-[var(--flux-chrome-alpha-08)] px-3 py-2">
                <span className="text-xs font-semibold uppercase text-[var(--flux-text-muted)]">Public API tokens</span>
                <button
                  type="button"
                  className="text-[10px] font-semibold text-[var(--flux-primary)]"
                  onClick={() =>
                    downloadCsv(
                      "public-api-tokens.csv",
                      ["id", "name", "orgId", "keyPrefix", "active", "scopes", "updatedAt"],
                      (ops?.publicApiTokens.items ?? []).map((x) => [
                        x.id,
                        x.name,
                        x.orgId,
                        x.keyPrefix,
                        x.active ? "true" : "false",
                        x.scopes.join("|"),
                        x.updatedAt,
                      ])
                    )
                  }
                >
                  export CSV
                </button>
              </div>
              <div className="max-h-72 overflow-auto">
                {(ops?.publicApiTokens.items ?? []).map((x) => (
                  <div key={x.id} className="border-b border-[var(--flux-chrome-alpha-06)] px-3 py-2 text-xs">
                    <div className="font-semibold text-[var(--flux-text)]">{x.name} · {x.keyPrefix}***</div>
                    <div className="text-[var(--flux-text-muted)]">{x.orgId} · {x.active ? "active" : "revoked"} · {x.scopes.join(", ")}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {editOrg && (
        <div
          className="fixed inset-0 z-[var(--flux-z-modal-base)] flex items-center justify-center bg-[var(--flux-backdrop-scrim-strong)]"
          onClick={() => setEditOrg(null)}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <h3 className="mb-4 font-display font-bold text-[var(--flux-text)]">{t("editOrgTitle")}</h3>
            {formError && <p className="mb-2 text-sm text-[var(--flux-danger)]">{formError}</p>}
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-[var(--flux-text-muted)]">{t("colOrgName")}</label>
              <input
                className="w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm"
                value={formOrg.name}
                onChange={(e) => setFormOrg((f) => ({ ...f, name: e.target.value }))}
              />
              <label className="block text-xs font-semibold text-[var(--flux-text-muted)]">{t("colSlug")}</label>
              <input
                className="w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm"
                value={formOrg.slug}
                onChange={(e) => setFormOrg((f) => ({ ...f, slug: e.target.value }))}
              />
              <label className="block text-xs font-semibold text-[var(--flux-text-muted)]">{t("colPlan")}</label>
              <select
                className="w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm"
                value={formOrg.plan}
                onChange={(e) => setFormOrg((f) => ({ ...f, plan: e.target.value as OrgRow["plan"] }))}
              >
                <option value="free">free</option>
                <option value="trial">trial</option>
                <option value="pro">pro</option>
                <option value="business">business</option>
              </select>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-[var(--flux-text-muted)]">maxUsers</label>
                  <input
                    type="number"
                    className="w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm"
                    value={formOrg.maxUsers}
                    onChange={(e) => setFormOrg((f) => ({ ...f, maxUsers: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--flux-text-muted)]">maxBoards</label>
                  <input
                    type="number"
                    className="w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm"
                    value={formOrg.maxBoards}
                    onChange={(e) => setFormOrg((f) => ({ ...f, maxBoards: Number(e.target.value) }))}
                  />
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn-sm" onClick={() => setEditOrg(null)}>
                {t("cancel")}
              </button>
              <button type="button" className="btn-primary" onClick={() => void saveOrg()}>
                {t("save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {editUser && (
        <div
          className="fixed inset-0 z-[var(--flux-z-modal-base)] flex items-center justify-center bg-[var(--flux-backdrop-scrim-strong)]"
          onClick={() => setEditUser(null)}
          role="presentation"
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <h3 className="mb-4 font-display font-bold text-[var(--flux-text)]">{t("editUserTitle")}</h3>
            {formError && <p className="mb-2 text-sm text-[var(--flux-danger)]">{formError}</p>}
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-[var(--flux-text-muted)]">{t("colName")}</label>
              <input
                className="w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm"
                value={formUser.name}
                onChange={(e) => setFormUser((f) => ({ ...f, name: e.target.value }))}
              />
              <label className="block text-xs font-semibold text-[var(--flux-text-muted)]">{t("colEmail")}</label>
              <input
                className="w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm"
                value={formUser.email}
                onChange={(e) => setFormUser((f) => ({ ...f, email: e.target.value }))}
              />
              <label className="block text-xs font-semibold text-[var(--flux-text-muted)]">{t("newPassword")}</label>
              <input
                type="password"
                autoComplete="new-password"
                placeholder="(opcional)"
                className="w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm"
                value={formUser.password}
                onChange={(e) => setFormUser((f) => ({ ...f, password: e.target.value }))}
              />
              <label className="block text-xs font-semibold text-[var(--flux-text-muted)]">{t("colOrg")}</label>
              <input
                className="w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 font-mono text-sm"
                value={formUser.orgId}
                onChange={(e) => setFormUser((f) => ({ ...f, orgId: e.target.value }))}
              />
              <label className="block text-xs font-semibold text-[var(--flux-text-muted)]">{t("colRole")}</label>
              <select
                className="w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm"
                value={formUser.orgRole}
                onChange={(e) =>
                  setFormUser((f) => ({
                    ...f,
                    orgRole: e.target.value as "gestor" | "membro" | "convidado",
                  }))
                }
              >
                <option value="gestor">gestor</option>
                <option value="membro">membro</option>
                <option value="convidado">convidado</option>
              </select>
              <label className="block text-xs font-semibold text-[var(--flux-text-muted)]">{t("colPlatform")}</label>
              <select
                className="w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm"
                value={formUser.platformRole}
                onChange={(e) =>
                  setFormUser((f) => ({
                    ...f,
                    platformRole: e.target.value as "platform_admin" | "platform_user",
                  }))
                }
              >
                <option value="platform_user">platform_user</option>
                <option value="platform_admin">platform_admin</option>
              </select>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn-sm" onClick={() => setEditUser(null)}>
                {t("cancel")}
              </button>
              <button type="button" className="btn-primary" onClick={() => void saveUser()}>
                {t("save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {newUserOpen && (
        <div
          className="fixed inset-0 z-[var(--flux-z-modal-base)] flex items-center justify-center bg-[var(--flux-backdrop-scrim-strong)]"
          onClick={() => setNewUserOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <h3 className="mb-4 font-display font-bold text-[var(--flux-text)]">{t("newUser")}
            </h3>
            {formError && <p className="mb-2 text-sm text-[var(--flux-danger)]">{formError}</p>}
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-[var(--flux-text-muted)]">{t("colOrgId")}</label>
              <input
                className="w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 font-mono text-sm"
                placeholder="org_..."
                value={newUserForm.orgId}
                onChange={(e) => setNewUserForm((f) => ({ ...f, orgId: e.target.value }))}
              />
              <label className="block text-xs font-semibold text-[var(--flux-text-muted)]">{t("colName")}</label>
              <input
                className="w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm"
                value={newUserForm.name}
                onChange={(e) => setNewUserForm((f) => ({ ...f, name: e.target.value }))}
              />
              <label className="block text-xs font-semibold text-[var(--flux-text-muted)]">{t("colEmail")}</label>
              <input
                className="w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm"
                value={newUserForm.email}
                onChange={(e) => setNewUserForm((f) => ({ ...f, email: e.target.value }))}
              />
              <label className="block text-xs font-semibold text-[var(--flux-text-muted)]">{t("password")}</label>
              <input
                type="password"
                className="w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm"
                value={newUserForm.password}
                onChange={(e) => setNewUserForm((f) => ({ ...f, password: e.target.value }))}
              />
              <label className="block text-xs font-semibold text-[var(--flux-text-muted)]">{t("colRole")}</label>
              <select
                className="w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm"
                value={newUserForm.orgRole}
                onChange={(e) =>
                  setNewUserForm((f) => ({
                    ...f,
                    orgRole: e.target.value as "gestor" | "membro" | "convidado",
                  }))
                }
              >
                <option value="gestor">gestor</option>
                <option value="membro">membro</option>
                <option value="convidado">convidado</option>
              </select>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn-sm" onClick={() => setNewUserOpen(false)}>
                {t("cancel")}
              </button>
              <button type="button" className="btn-primary" onClick={() => void createUser()}>
                {t("create")}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDeleteUser}
        title={t("deleteUserTitle")}
        description={confirmDeleteUser ? t("deleteUserConfirm", { name: confirmDeleteUser.name }) : undefined}
        confirmText={t("delete")}
        cancelText={t("cancel")}
        intent="danger"
        busy={deleteUserBusy}
        onCancel={() => {
          if (deleteUserBusy) return;
          setConfirmDeleteUser(null);
          pendingDeleteUserRef.current = null;
        }}
        onConfirm={() => {
          const row = pendingDeleteUserRef.current ?? confirmDeleteUser;
          if (row) void deleteUserConfirmed(row);
        }}
      />

      <ConfirmDialog
        open={!!confirmDeleteOrg}
        title={t("deleteOrgTitle")}
        description={confirmDeleteOrg ? t("deleteOrgConfirm", { name: confirmDeleteOrg.name }) : undefined}
        confirmText={t("delete")}
        cancelText={t("cancel")}
        intent="danger"
        onCancel={() => setConfirmDeleteOrg(null)}
        onConfirm={() => {
          if (confirmDeleteOrg) void deleteOrgConfirmed(confirmDeleteOrg);
        }}
      />
    </div>
  );
}
