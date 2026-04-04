"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { Header } from "@/components/header";
import { apiGet, apiPost, apiPut, apiDelete, ApiError } from "@/lib/api-client";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/context/toast-context";
import { sessionCanManageOrgBilling } from "@/lib/rbac";

interface UserRow {
  id: string;
  username: string;
  name: string;
  email: string;
  isAdmin: boolean;
  orgRole?: "gestor" | "membro" | "convidado";
}

function roleLabel(u: UserRow): string {
  if (u.orgRole === "gestor" || (u.isAdmin && u.orgRole !== "membro" && u.orgRole !== "convidado")) {
    return "Gestor";
  }
  if (u.orgRole === "convidado") return "Convidado";
  return "Membro";
}

export default function UsersPage() {
  const router = useRouter();
  const { user, getHeaders, isChecked, refreshSession } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"new" | "edit">("new");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPwd, setFormPwd] = useState("");
  const [formOrgRole, setFormOrgRole] = useState<"gestor" | "membro" | "convidado">("membro");
  const [formError, setFormError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const { pushToast } = useToast();

  useEffect(() => {
    if (!isChecked || !user) {
      router.replace("/login");
      return;
    }
    if (!sessionCanManageOrgBilling(user)) {
      router.replace("/boards");
      return;
    }
    loadUsers();
  }, [isChecked, user, router]);

  async function loadUsers() {
    try {
      const data = await apiGet<{ users: UserRow[] }>("/api/users", getHeaders());
      setUsers(data.users ?? []);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 401) router.replace("/login");
        else if (e.status === 403) router.replace("/boards");
      }
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }

  function openNewModal() {
    setModalMode("new");
    setEditingId(null);
    setFormName("");
    setFormEmail("");
    setFormPwd("");
    setFormOrgRole("membro");
    setFormError("");
    setModalOpen(true);
  }

  function openEditModal(u: UserRow) {
    setModalMode("edit");
    setEditingId(u.id);
    setFormName(u.name);
    setFormEmail(u.email);
    setFormPwd("");
    setFormOrgRole(
      u.orgRole === "gestor" || u.orgRole === "convidado" || u.orgRole === "membro"
        ? u.orgRole
        : u.isAdmin
          ? "gestor"
          : "membro"
    );
    setFormError("");
    setModalOpen(true);
  }

  async function createUser() {
    setFormError("");
    if (!formName.trim() || !formEmail.trim() || !formPwd) {
      setFormError("Preencha todos os campos.");
      return;
    }
    if (formPwd.length < 8) {
      setFormError("Senha deve ter pelo menos 8 caracteres.");
      return;
    }
    try {
      await apiPost(
        "/api/users",
        {
          name: formName.trim(),
          email: formEmail.trim(),
          password: formPwd,
          orgRole: formOrgRole,
        },
        getHeaders()
      );
      setModalOpen(false);
      loadUsers();
    } catch (e) {
      setFormError(e instanceof ApiError ? (e.data as { error?: string })?.error ?? e.message : "Erro ao criar.");
    }
  }

  async function saveUser() {
    if (!editingId) return;
    setFormError("");
    if (!formName.trim()) {
      setFormError("Nome é obrigatório.");
      return;
    }
    const body: {
      name: string;
      email?: string;
      password?: string;
      orgRole: "gestor" | "membro" | "convidado";
    } = {
      name: formName.trim(),
      orgRole: formOrgRole,
    };
    if (editingId === "admin" && user?.id === "admin" && formEmail.trim()) {
      body.email = formEmail.trim().toLowerCase();
    }
    if (formPwd.length >= 8) body.password = formPwd;
    try {
      await apiPut(`/api/users/${editingId}`, body, getHeaders());
      setModalOpen(false);
      await loadUsers();
      if (user && editingId === user.id) {
        await refreshSession();
      }
    } catch (e) {
      setFormError(e instanceof ApiError ? (e.data as { error?: string })?.error ?? e.message : "Erro ao salvar.");
    }
  }

  async function deleteUser(id: string, name: string) {
    setConfirmDelete({ id, name });
  }

  if (!user) return null;

  return (
    <div className="min-h-screen">
      <Header title="Usuários" backHref="/boards" />
      <main className="max-w-[900px] mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-xl font-bold text-[var(--flux-text)]">
            Administrar Usuários
          </h2>
          <button
            onClick={openNewModal}
            className="btn-primary"
          >
            + Novo Usuário
          </button>
        </div>

        {loading ? (
          <p className="text-[var(--flux-text-muted)]">Carregando...</p>
        ) : (
          <div className="bg-[var(--flux-surface-card)] border border-[var(--flux-primary-alpha-20)] rounded-[var(--flux-rad)] shadow-[var(--shadow-md)] overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="px-4 py-3 bg-[var(--flux-surface-elevated)] font-display text-xs font-bold text-[var(--flux-text-muted)] uppercase tracking-wide text-left">
                    Nome
                  </th>
                  <th className="px-4 py-3 bg-[var(--flux-surface-elevated)] font-display text-xs font-bold text-[var(--flux-text-muted)] uppercase tracking-wide text-left">
                    E-mail
                  </th>
                  <th className="px-4 py-3 bg-[var(--flux-surface-elevated)] font-display text-xs font-bold text-[var(--flux-text-muted)] uppercase tracking-wide text-left">
                    Tipo
                  </th>
                  <th className="px-4 py-3 bg-[var(--flux-surface-elevated)] font-display text-xs font-bold text-[var(--flux-text-muted)] uppercase tracking-wide text-left">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-[var(--flux-chrome-alpha-06)] hover:bg-[var(--flux-primary-alpha-06)]"
                  >
                    <td className="px-4 py-3 text-[var(--flux-text)]">{u.name}</td>
                    <td className="px-4 py-3 text-[var(--flux-text-muted)]">{u.email}</td>
                    <td className="px-4 py-3">
                      {roleLabel(u) === "Gestor" ? (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-[var(--flux-primary)] text-white">
                          Gestor
                        </span>
                      ) : roleLabel(u) === "Convidado" ? (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-[var(--flux-chrome-alpha-12)] text-[var(--flux-text-muted)]">
                          Convidado
                        </span>
                      ) : (
                        "Membro"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {u.id !== "admin" || user?.id === "admin" ? (
                        <div className="flex gap-3">
                          <button
                            onClick={() => openEditModal(u)}
                            className="btn-sm border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)] hover:bg-[var(--flux-primary-alpha-10)] hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)]"
                          >
                            Editar
                          </button>
                          {u.id !== "admin" ? (
                            <button
                              onClick={() => deleteUser(u.id, u.name)}
                              className="btn-sm border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)] hover:bg-[var(--flux-danger-alpha-12)] hover:border-[var(--flux-danger)] hover:text-[var(--flux-danger)]"
                            >
                              Excluir
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {modalOpen && (
        <div
          className="fixed inset-0 bg-[var(--flux-backdrop-scrim-strong)] z-[var(--flux-z-modal-base)] flex items-center justify-center"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="bg-[var(--flux-surface-card)] border border-[var(--flux-primary-alpha-20)] rounded-[var(--flux-rad)] p-6 min-w-[360px] max-w-[95%]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display font-bold mb-4 text-[var(--flux-text)]">
              {modalMode === "new" ? "Novo Usuário" : "Editar Usuário"}
            </h3>
            {formError && (
              <p className="text-[var(--flux-danger)] text-sm mb-2">{formError}</p>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">
                  Nome
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Nome completo"
                  className="w-full px-3 py-2 border border-[var(--flux-chrome-alpha-12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] focus:border-[var(--flux-primary)] outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">
                  E-mail
                </label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="email@exemplo.com"
                  disabled={modalMode === "edit" && !(user?.id === "admin" && editingId === "admin")}
                  className="w-full px-3 py-2 border border-[var(--flux-chrome-alpha-12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] disabled:opacity-60 focus:border-[var(--flux-primary)] outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">
                  Senha
                </label>
                <input
                  type="password"
                  value={formPwd}
                  onChange={(e) => setFormPwd(e.target.value)}
                  placeholder={modalMode === "edit" ? "Deixe em branco para manter" : "Mínimo 8 caracteres"}
                  className="w-full px-3 py-2 border border-[var(--flux-chrome-alpha-12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] focus:border-[var(--flux-primary)] outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">
                  Papel na organização
                </label>
                <select
                  value={formOrgRole}
                  onChange={(e) =>
                    setFormOrgRole(e.target.value as "gestor" | "membro" | "convidado")
                  }
                  className="w-full px-3 py-2 border border-[var(--flux-chrome-alpha-12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] focus:border-[var(--flux-primary)] outline-none"
                >
                  <option value="gestor">Gestor</option>
                  <option value="membro">Membro</option>
                  <option value="convidado">Convidado</option>
                </select>
              </div>
              <p className="text-[11px] text-[var(--flux-text-muted)]">
                Gestores gerem billing, convites e definições. Convidados têm as mesmas bases que membros, com limitações extra (ex.: não criar boards).
              </p>
            </div>
            <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-[var(--flux-chrome-alpha-08)]">
              <button
                onClick={() => setModalOpen(false)}
                className="btn-secondary"
              >
                Cancelar
              </button>
              <button
                onClick={modalMode === "new" ? createUser : saveUser}
                className="btn-primary"
              >
                {modalMode === "new" ? "Criar" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title={confirmDelete ? `Excluir o usuário "${confirmDelete.name}"?` : ""}
        description="Esta ação não pode ser desfeita."
        intent="danger"
        confirmText="Excluir"
        cancelText="Cancelar"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          try {
            await apiDelete(`/api/users/${confirmDelete.id}`, getHeaders());
            setConfirmDelete(null);
            loadUsers();
          } catch {
            pushToast({ kind: "error", title: "Erro ao excluir." });
          }
        }}
      />
    </div>
  );
}
