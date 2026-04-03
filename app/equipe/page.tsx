"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Header } from "@/components/header";
import { TeamWorkspacePanel } from "@/components/team/team-workspace-panel";
import { useAuth } from "@/context/auth-context";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api-client";
import { useToast } from "@/context/toast-context";
import { normalizeTeamRole, sessionCanManageMembersAndBilling, type TeamRole } from "@/lib/rbac";

type TeamMember = {
  userId: string;
  role: TeamRole;
  boardId?: string;
  active: boolean;
  updatedAt: string;
};
type UserLite = { id: string; username: string; name: string; email: string; isAdmin: boolean };
type BoardLite = { id: string; name: string };

const ROLE_OPTIONS: Array<{ value: TeamMember["role"]; label: string }> = [
  { value: "team_manager", label: "Gestor" },
  { value: "member", label: "Membro" },
  { value: "guest", label: "Convidado" },
];
const PAGE_SIZES = [10, 25, 50] as const;
type TeamTab = "membros" | "funcoes" | "acessos";

const VALID_TABS = new Set<TeamTab>(["membros", "funcoes", "acessos"]);
const VALID_TEAM_ROLES = new Set<TeamMember["role"]>(["team_manager", "member", "guest"]);

function parseTeamTab(raw: string | null): TeamTab {
  return raw && VALID_TABS.has(raw as TeamTab) ? (raw as TeamTab) : "membros";
}

function parseRoleFilter(raw: string | null): "all" | TeamMember["role"] {
  if (!raw || raw === "all") return "all";
  return VALID_TEAM_ROLES.has(raw as TeamMember["role"]) ? (raw as TeamMember["role"]) : "all";
}

function parseStatusFilter(raw: string | null): "all" | "active" | "inactive" {
  if (raw === "active" || raw === "inactive") return raw;
  return "all";
}

function parseScopeFilter(raw: string | null): "all" | "org" | "board" {
  if (raw === "org" || raw === "board") return raw;
  return "all";
}

const VALID_SORTS = new Set(["updatedAt_desc", "updatedAt_asc", "role_asc", "role_desc"]);

export default function TeamPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const localeRoot = `/${locale}`;
  const { getHeaders, user, isChecked } = useAuth();
  const hideInlineTabs = /^\/(pt-BR|en)\/equipe/.test(pathname);
  const { pushToast } = useToast();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [boards, setBoards] = useState<BoardLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [role, setRole] = useState<TeamMember["role"]>("member");
  const [boardId, setBoardId] = useState<string>("org");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<TeamMember["role"]>("member");
  const [editBoardId, setEditBoardId] = useState<string>("org");
  const [editActive, setEditActive] = useState(true);

  const tab = parseTeamTab(searchParams.get("tab"));
  const roleFilter = parseRoleFilter(searchParams.get("role"));
  const statusFilter = parseStatusFilter(searchParams.get("status"));
  const scopeFilter = parseScopeFilter(searchParams.get("scope"));
  const membersQuery = searchParams.get("q") || "";
  const pageSizeRaw = Number.parseInt(searchParams.get("pageSize") || "10", 10);
  const pageSize = PAGE_SIZES.includes(pageSizeRaw as (typeof PAGE_SIZES)[number]) ? pageSizeRaw : 10;
  const sortRaw = searchParams.get("sort") || "updatedAt_desc";
  const sort = VALID_SORTS.has(sortRaw) ? sortRaw : "updatedAt_desc";
  const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
  const isDirtyFilters =
    membersQuery.trim().length > 0 ||
    roleFilter !== "all" ||
    statusFilter !== "all" ||
    scopeFilter !== "all" ||
    page !== 1 ||
    pageSize !== 10 ||
    sort !== "updatedAt_desc";

  function updateQuery(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      if (!v) params.delete(k);
      else params.set(k, v);
    }
    router.replace(`${pathname}?${params.toString()}`);
  }

  async function loadData() {
    setLoading(true);
    try {
      const [membersData, usersData, boardsData] = await Promise.all([
        apiGet<{ members: TeamMember[] }>("/api/team/members", getHeaders()),
        apiGet<{ users: UserLite[] }>("/api/users", getHeaders()),
        apiGet<{ boards: BoardLite[] }>("/api/boards", getHeaders()),
      ]);
      setMembers(
        (membersData.members ?? []).map((m) => ({ ...m, role: normalizeTeamRole(m.role) }))
      );
      setUsers(usersData.users ?? []);
      setBoards(
        (boardsData.boards ?? [])
          .filter((b) => typeof b.id === "string" && b.id.length > 0 && typeof b.name === "string")
          .map((b) => ({ id: b.id, name: b.name }))
      );
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Erro ao carregar dados de equipe.";
      pushToast({ kind: "error", title: msg });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isChecked) return;
    if (!user) {
      router.replace(`${localeRoot}/login`);
      return;
    }
    if (!sessionCanManageMembersAndBilling(user)) {
      router.replace(`${localeRoot}/boards`);
      return;
    }
    void loadData();
  }, [getHeaders, isChecked, user, router, localeRoot]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users.slice(0, 20);
    return users
      .filter((u) =>
        [u.name, u.email, u.username].some((v) => v.toLowerCase().includes(q))
      )
      .slice(0, 30);
  }, [query, users]);

  const usersById = useMemo(() => {
    const map = new Map<string, UserLite>();
    users.forEach((u) => map.set(u.id, u));
    return map;
  }, [users]);
  const boardsById = useMemo(() => {
    const map = new Map<string, BoardLite>();
    boards.forEach((b) => map.set(b.id, b));
    return map;
  }, [boards]);

  const filteredMembers = useMemo(() => {
    const q = membersQuery.trim().toLowerCase();
    return members.filter((m) => {
      const user = usersById.get(m.userId);
      const board = m.boardId ? boardsById.get(m.boardId) : undefined;
      if (roleFilter !== "all" && normalizeTeamRole(m.role) !== normalizeTeamRole(roleFilter)) return false;
      if (statusFilter === "active" && !m.active) return false;
      if (statusFilter === "inactive" && m.active) return false;
      if (scopeFilter === "org" && m.boardId) return false;
      if (scopeFilter === "board" && !m.boardId) return false;
      if (!q) return true;
      const hay = [
        m.userId,
        user?.name ?? "",
        user?.email ?? "",
        user?.username ?? "",
        board?.name ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [members, usersById, boardsById, roleFilter, statusFilter, scopeFilter, membersQuery]);

  const sortedMembers = useMemo(() => {
    const list = [...filteredMembers];
    if (sort === "updatedAt_asc") {
      list.sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
      return list;
    }
    if (sort === "role_asc") {
      list.sort((a, b) => normalizeTeamRole(a.role).localeCompare(normalizeTeamRole(b.role)));
      return list;
    }
    if (sort === "role_desc") {
      list.sort((a, b) => normalizeTeamRole(b.role).localeCompare(normalizeTeamRole(a.role)));
      return list;
    }
    // default: updatedAt_desc
    list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return list;
  }, [filteredMembers, sort]);

  const totalPages = Math.max(1, Math.ceil(sortedMembers.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedMembers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedMembers.slice(start, start + pageSize);
  }, [sortedMembers, currentPage, pageSize]);

  async function handleCreateOrUpdate() {
    if (!selectedUserId) {
      pushToast({ kind: "error", title: "Selecione um usuário pelo nome ou e-mail." });
      return;
    }
    setSaving(true);
    try {
      await apiPost(
        "/api/team/members",
        {
          userId: selectedUserId,
          role,
          boardId: boardId === "org" ? undefined : boardId,
          active,
        },
        getHeaders()
      );
      pushToast({ kind: "success", title: "Vínculo salvo com sucesso." });
      setQuery("");
      setSelectedUserId("");
      setRole("member");
      setBoardId("org");
      setActive(true);
      await loadData();
    } catch (e) {
      pushToast({ kind: "error", title: e instanceof ApiError ? e.message : "Erro ao salvar vínculo." });
    } finally {
      setSaving(false);
    }
  }

  async function handlePatch(userId: string) {
    setSaving(true);
    try {
      await apiPatch(
        `/api/team/members/${encodeURIComponent(userId)}`,
        {
          role: editRole,
          boardId: editBoardId === "org" ? undefined : editBoardId,
          active: editActive,
        },
        getHeaders()
      );
      pushToast({ kind: "success", title: "Vínculo atualizado." });
      setEditingKey(null);
      await loadData();
    } catch (e) {
      pushToast({ kind: "error", title: e instanceof ApiError ? e.message : "Erro ao atualizar vínculo." });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(member: TeamMember) {
    setSaving(true);
    try {
      const suffix = member.boardId ? `?boardId=${encodeURIComponent(member.boardId)}` : "";
      await apiDelete(`/api/team/members/${encodeURIComponent(member.userId)}${suffix}`, getHeaders());
      pushToast({ kind: "success", title: "Vínculo removido." });
      await loadData();
    } catch (e) {
      pushToast({ kind: "error", title: e instanceof ApiError ? e.message : "Erro ao remover vínculo." });
    } finally {
      setSaving(false);
    }
  }

  const rootClass = hideInlineTabs ? "flex min-h-0 flex-1 flex-col" : "flex min-h-screen flex-col";

  return (
    <div className={rootClass}>
      <Header title="Equipe" backHref={`${localeRoot}/boards`} backLabel="← Boards" />
      <TeamWorkspacePanel>
        {!hideInlineTabs ? (
          <div className="mb-5 flex flex-wrap gap-2">
            {([
              { key: "membros", label: "Membros" },
              { key: "funcoes", label: "Funções" },
              { key: "acessos", label: "Acessos" },
            ] as Array<{ key: TeamTab; label: string }>).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => updateQuery({ tab: item.key, page: "1" })}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  tab === item.key
                    ? "bg-[var(--flux-primary-alpha-20)] text-[var(--flux-primary-light)] ring-1 ring-[var(--flux-primary-alpha-35)]"
                    : "bg-[var(--flux-chrome-alpha-08)] text-[var(--flux-text-muted)] hover:bg-[var(--flux-primary-alpha-08)] hover:text-[var(--flux-text)]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}

        {tab === "membros" ? (
          <>
        <div className="space-y-4 rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]/35 p-4 sm:p-5">
          <div>
            <h2 className="font-display text-base font-semibold text-[var(--flux-text)]">Responsáveis da equipe</h2>
            <p className="mt-1 text-xs text-[var(--flux-text-muted)]">
              Selecione usuário por nome ou e-mail, defina nível e escopo (organização ou board).
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[var(--flux-text-muted)] uppercase tracking-wide">Buscar usuário</label>
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedUserId("");
                }}
                placeholder="Nome, usuário ou e-mail"
                className="w-full rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-3 py-2 text-sm text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
              />
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-3 py-2 text-sm text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
              >
                <option value="">Selecione um usuário...</option>
                {filteredUsers
                  .filter((u) => typeof u.id === "string" && u.id.length > 0)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {[u.name, u.email].filter(Boolean).join(" — ") || u.id}
                    </option>
                  ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <label className="text-xs font-semibold text-[var(--flux-text-muted)] uppercase tracking-wide">Nível</label>
              <select value={role} onChange={(e) => setRole(e.target.value as TeamMember["role"])} className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-3 py-2 text-sm text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]">
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <label className="text-xs font-semibold text-[var(--flux-text-muted)] uppercase tracking-wide">Escopo</label>
              <select value={boardId} onChange={(e) => setBoardId(e.target.value)} className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-3 py-2 text-sm text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]">
                <option value="org">Organização inteira</option>
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                Vínculo ativo
              </label>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleCreateOrUpdate()}
              className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar vínculo"}
            </button>
          </div>
        </div>

        <div className="mt-5 space-y-3 rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]/35 p-4 sm:p-5">
          <div>
            <h3 className="font-display text-sm font-semibold text-[var(--flux-text)]">
              Vínculos cadastrados ({filteredMembers.length})
            </h3>
            <p className="mt-0.5 text-xs text-[var(--flux-text-muted)]">Filtre, ordene e edite vínculos existentes.</p>
          </div>
          <div className="mb-1 flex flex-wrap gap-2">
            <input
              value={membersQuery}
              onChange={(e) => updateQuery({ q: e.target.value || null, page: "1" })}
              placeholder="Filtro por nome, e-mail, userId ou board"
              className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-3 py-2 text-sm text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
            />
            <select
              value={roleFilter}
              onChange={(e) => updateQuery({ role: e.target.value === "all" ? null : e.target.value, page: "1" })}
              className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-3 py-2 text-sm text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
            >
              <option value="all">Todos os níveis</option>
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => updateQuery({ status: e.target.value === "all" ? null : e.target.value, page: "1" })}
              className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-3 py-2 text-sm text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
            >
              <option value="all">Todos os status</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>
            <select
              value={scopeFilter}
              onChange={(e) => updateQuery({ scope: e.target.value === "all" ? null : e.target.value, page: "1" })}
              className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-3 py-2 text-sm text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
            >
              <option value="all">Todos os escopos</option>
              <option value="org">Somente organização</option>
              <option value="board">Somente board</option>
            </select>
            <select
              value={String(pageSize)}
              onChange={(e) => updateQuery({ pageSize: e.target.value, page: "1" })}
              className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-3 py-2 text-sm text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size} por página
                </option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(e) => updateQuery({ sort: e.target.value, page: "1" })}
              className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-3 py-2 text-sm text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
            >
              <option value="updatedAt_desc">Mais recentes</option>
              <option value="updatedAt_asc">Mais antigos</option>
              <option value="role_asc">Nível A-Z</option>
              <option value="role_desc">Nível Z-A</option>
            </select>
            {isDirtyFilters ? (
              <button
                type="button"
                onClick={() =>
                  updateQuery({
                    q: null,
                    role: null,
                    status: null,
                    scope: null,
                    page: "1",
                    pageSize: "10",
                    sort: "updatedAt_desc",
                  })
                }
                className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-3 py-2 text-sm text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
              >
                Resetar filtros
              </button>
            ) : null}
          </div>
          {loading ? <p className="mt-3 text-sm text-[var(--flux-text-muted)]">Carregando...</p> : null}
          {!loading && filteredMembers.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--flux-text-muted)]">Nenhum vínculo cadastrado.</p>
          ) : null}
          <ul className="mt-3 space-y-2">
            {pagedMembers.map((m) => {
              const key = `${m.userId}:${m.boardId ?? "org"}`;
              const user = usersById.get(m.userId);
              const board = m.boardId ? boardsById.get(m.boardId) : undefined;
              const isEditing = editingKey === key;
              return (
                <li key={key} className="rounded-lg border border-[var(--flux-chrome-alpha-10)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--flux-text)]">
                        {user?.name ?? m.userId} {user?.email ? `- ${user.email}` : ""}
                      </p>
                      <p className="text-xs text-[var(--flux-text-muted)]">
                        {board ? `Board: ${board.name}` : "Escopo: Organização"}
                      </p>
                    </div>
                    {!isEditing ? (
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-[var(--flux-primary-alpha-35)] px-2 py-0.5 text-xs">
                          {ROLE_OPTIONS.find((r) => r.value === normalizeTeamRole(m.role))?.label ??
                            normalizeTeamRole(m.role)}
                        </span>
                        {!m.active ? (
                          <span className="rounded-full border border-[var(--flux-warning-alpha-35)] px-2 py-0.5 text-xs">Inativo</span>
                        ) : null}
                        <button
                          type="button"
                          className="btn-secondary px-2 py-1 text-xs"
                          onClick={() => {
                            setEditingKey(key);
                            setEditRole(normalizeTeamRole(m.role));
                            setEditBoardId(m.boardId ?? "org");
                            setEditActive(m.active);
                          }}
                        >
                          Editar
                        </button>
                        <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => void handleDelete(m)}>
                          Remover
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                        <select value={editRole} onChange={(e) => setEditRole(e.target.value as TeamMember["role"])} className="rounded-lg border border-[var(--flux-chrome-alpha-12)] px-2 py-1 text-xs">
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                        <select value={editBoardId} onChange={(e) => setEditBoardId(e.target.value)} className="rounded-lg border border-[var(--flux-chrome-alpha-12)] px-2 py-1 text-xs">
                          <option value="org">Organização</option>
                          {boards.map((b) => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                        <label className="inline-flex items-center gap-1 text-xs">
                          <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} />
                          Ativo
                        </label>
                        <div className="flex gap-1">
                          <button type="button" className="btn-primary px-2 py-1 text-xs" onClick={() => void handlePatch(m.userId)}>
                            Salvar
                          </button>
                          <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => setEditingKey(null)}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {sortedMembers.length > pageSize ? (
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-[var(--flux-text-muted)]">
                Página {currentPage} de {totalPages} - {pageSize} por página
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => updateQuery({ page: String(currentPage - 1) })}
                  className="btn-secondary px-2 py-1 text-xs disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => updateQuery({ page: String(currentPage + 1) })}
                  className="btn-secondary px-2 py-1 text-xs disabled:opacity-50"
                >
                  Próxima
                </button>
              </div>
            </div>
          ) : null}
        </div>
          </>
        ) : null}

        {tab === "funcoes" ? (
          <div className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]/35 p-4 sm:p-5">
            <h3 className="font-display text-sm font-semibold text-[var(--flux-text)]">Funções e responsabilidades</h3>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--flux-text-muted)]">
              <li><strong className="text-[var(--flux-text)]">Gestor</strong>: gerencia vínculos e níveis no contexto EQUIPE.</li>
              <li><strong className="text-[var(--flux-text)]">Membro</strong>: executa cards e pode ser responsável.</li>
              <li><strong className="text-[var(--flux-text)]">Convidado</strong>: leitura/acompanhamento.</li>
            </ul>
          </div>
        ) : null}

        {tab === "acessos" ? (
          <div className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)]/35 p-4 sm:p-5">
            <h3 className="font-display text-sm font-semibold text-[var(--flux-text)]">Acessos por escopo</h3>
            <p className="mt-1 text-xs text-[var(--flux-text-muted)]">
              Visão resumida dos vínculos por organização e por board.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-[var(--flux-chrome-alpha-10)] p-3">
                <p className="text-xs text-[var(--flux-text-muted)]">Vínculos em organização</p>
                <p className="mt-1 text-xl font-semibold text-[var(--flux-text)]">
                  {members.filter((m) => !m.boardId).length}
                </p>
              </div>
              <div className="rounded-lg border border-[var(--flux-chrome-alpha-10)] p-3">
                <p className="text-xs text-[var(--flux-text-muted)]">Vínculos por board</p>
                <p className="mt-1 text-xl font-semibold text-[var(--flux-text)]">
                  {members.filter((m) => !!m.boardId).length}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </TeamWorkspacePanel>
    </div>
  );
}
