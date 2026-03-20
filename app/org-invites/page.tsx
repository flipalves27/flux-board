"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { useAuth } from "@/context/auth-context";
import { Header } from "@/components/header";
import { useToast } from "@/context/toast-context";

type InviteRow = {
  _id: string;
  orgId: string;
  emailLower: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  usedByUserId?: string;
};

function formatDateShort(iso?: string): string {
  if (!iso) return "-";
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
  const localeRoot = `/${locale}`;
  const { pushToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [invites, setInvites] = useState<InviteRow[]>([]);

  const [filter, setFilter] = useState<"active" | "used" | "expired" | "all">("active");

  const [lastInviteCode, setLastInviteCode] = useState<string | null>(null);
  const inviteUrl = useMemo(() => {
    if (!lastInviteCode) return null;
    if (typeof window === "undefined") return null;
    return `${window.location.origin}${localeRoot}/login?invite=${encodeURIComponent(lastInviteCode)}`;
  }, [lastInviteCode, localeRoot]);

  useEffect(() => {
    if (!isChecked || !user) {
      router.replace(`${localeRoot}/login`);
      return;
    }
    if (!user.isAdmin) {
      router.replace(`${localeRoot}/boards`);
      return;
    }
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const data = await apiGet<{ invites: InviteRow[] }>("/api/organization-invites", getHeaders());
        setInvites(data.invites ?? []);
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          router.replace(`${localeRoot}/login`);
          return;
        }
        setError(e instanceof ApiError ? e.message : "Erro ao carregar convites.");
      } finally {
        setLoading(false);
      }
    })();
  }, [isChecked, user, router, localeRoot, getHeaders]);

  async function refresh() {
    try {
      const data = await apiGet<{ invites: InviteRow[] }>("/api/organization-invites", getHeaders());
      setInvites(data.invites ?? []);
    } catch {
      // ignore
    }
  }

  async function createInvite() {
    if (!email.trim() || !email.includes("@")) {
      setError("Informe um e-mail válido.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const data = await apiPost<{ invite: { code: string } }>("/api/organization-invites", { email }, getHeaders());
      const code = (data as any)?.invite?.code;
      if (!code) throw new Error("Não foi possível gerar o convite.");
      setLastInviteCode(code);
      pushToast({ kind: "success", title: "Convite gerado." });
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Erro ao gerar convite.");
    } finally {
      setBusy(false);
    }
  }

  async function expireInvite(code: string) {
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/organization-invites/${encodeURIComponent(code)}/expire`, {}, getHeaders());
      pushToast({ kind: "info", title: "Convite expirado." });
      if (lastInviteCode === code) setLastInviteCode(null);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Erro ao expirar convite.");
    } finally {
      setBusy(false);
    }
  }

  const filteredInvites = useMemo(() => {
    const now = Date.now();
    if (filter === "all") return invites;
    return invites.filter((inv) => {
      const expired = new Date(inv.expiresAt).getTime() <= now;
      const used = Boolean(inv.usedAt);
      if (filter === "used") return used;
      if (filter === "expired") return !used && expired;
      // active
      return !used && !expired;
    });
  }, [invites, filter]);

  return (
    <div className="min-h-screen bg-[var(--flux-surface-dark)]">
      <Header title={tNav("invites")} backHref={`${localeRoot}/boards`} backLabel="← Boards">
        <div className="text-xs text-[var(--flux-text-muted)]">Gerencie convites da sua organização.</div>
      </Header>
      <main className="max-w-[980px] mx-auto px-6 py-10">
        <div className="rounded-[var(--flux-rad-xl)] border border-[rgba(108,92,231,0.2)] bg-[var(--flux-surface-card)] p-6 shadow-[0_10px_30px_rgba(0,0,0,0.2)]">
          <h2 className="font-display font-bold text-xl text-[var(--flux-text)] mb-1">Convites</h2>

          {error && (
            <div className="mb-4 bg-[rgba(255,107,107,0.12)] border border-[rgba(255,107,107,0.3)] text-[var(--flux-danger)] p-3 rounded-[var(--flux-rad)] text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">
                E-mail do convidado
              </label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-[rgba(255,255,255,0.12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                disabled={busy}
              />
            </div>
            <button className="btn-primary" type="button" disabled={busy} onClick={createInvite}>
              {busy ? "Aguarde..." : "Gerar convite"}
            </button>
          </div>

          {inviteUrl && (
            <div className="mt-6 p-4 rounded-[var(--flux-rad)] border border-[rgba(0,210,211,0.28)] bg-[rgba(0,210,211,0.08)]">
              <p className="text-xs font-semibold text-[var(--flux-text-muted)] uppercase tracking-wide">Link de convite</p>
              <div className="mt-2 flex flex-col gap-2">
                <code className="break-all text-[12px] text-[var(--flux-text)]">{inviteUrl}</code>
                <button
                  type="button"
                  className="btn-secondary w-fit"
                  disabled={busy}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(inviteUrl);
                      pushToast({ kind: "success", title: "Link copiado." });
                    } catch {
                      // ignore
                    }
                  }}
                >
                  Copiar
                </button>
              </div>
            </div>
          )}

          <div className="mt-8">
            {loading ? (
              <p className="text-[var(--flux-text-muted)]">Carregando...</p>
            ) : filteredInvites.length === 0 ? (
              <p className="text-[var(--flux-text-muted)]">Nenhum convite encontrado.</p>
            ) : (
              <div className="overflow-x-auto">
                <div className="mb-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setFilter("active")}
                    className={`btn-sm ${filter === "active" ? "btn-primary" : "btn-secondary"}`}
                  >
                    Ativos
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilter("used")}
                    className={`btn-sm ${filter === "used" ? "btn-primary" : "btn-secondary"}`}
                  >
                    Usados
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilter("expired")}
                    className={`btn-sm ${filter === "expired" ? "btn-primary" : "btn-secondary"}`}
                  >
                    Expirados
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilter("all")}
                    className={`btn-sm ${filter === "all" ? "btn-primary" : "btn-secondary"}`}
                  >
                    Todos
                  </button>
                </div>
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 bg-[var(--flux-surface-elevated)] font-display text-xs font-bold text-[var(--flux-text-muted)] uppercase tracking-wide text-left">
                        E-mail
                      </th>
                      <th className="px-4 py-3 bg-[var(--flux-surface-elevated)] font-display text-xs font-bold text-[var(--flux-text-muted)] uppercase tracking-wide text-left">
                        Expira
                      </th>
                      <th className="px-4 py-3 bg-[var(--flux-surface-elevated)] font-display text-xs font-bold text-[var(--flux-text-muted)] uppercase tracking-wide text-left">
                        Status
                      </th>
                      <th className="px-4 py-3 bg-[var(--flux-surface-elevated)] font-display text-xs font-bold text-[var(--flux-text-muted)] uppercase tracking-wide text-left">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInvites.map((inv) => {
                      const expired = new Date(inv.expiresAt).getTime() <= Date.now();
                      const used = Boolean(inv.usedAt);
                      const status = used ? "Usado" : expired ? "Expirado" : "Ativo";
                      const canExpire = !used && !expired;
                      return (
                        <tr key={inv._id} className="border-b border-[rgba(255,255,255,0.06)]">
                          <td className="px-4 py-3 text-[var(--flux-text-muted)]">{inv.emailLower}</td>
                          <td className="px-4 py-3 text-[var(--flux-text-muted)]">{formatDateShort(inv.expiresAt)}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                                used
                                  ? "bg-[rgba(0,210,211,0.18)] text-[var(--flux-secondary)]"
                                  : expired
                                    ? "bg-[rgba(255,107,107,0.12)] text-[var(--flux-danger)]"
                                    : "bg-[rgba(108,92,231,0.14)] text-[var(--flux-primary-light)]"
                              }`}
                            >
                              {status}
                            </span>
                            {used && (
                              <div className="mt-2 text-[11px] text-[var(--flux-text-muted)]">
                                Usado por: <span className="font-mono">{inv.usedByUserId ?? "—"}</span>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {canExpire ? (
                              <button
                                type="button"
                                className="btn-sm border-[rgba(255,255,255,0.12)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)] hover:bg-[rgba(108,92,231,0.1)] hover:border-[var(--flux-danger)] hover:text-[var(--flux-danger)]"
                                onClick={() => expireInvite(inv._id)}
                                disabled={busy}
                              >
                                Expirar
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

