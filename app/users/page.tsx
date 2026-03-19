"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { Header } from "@/components/header";
import { apiGet, apiPost, apiPut, apiDelete, ApiError } from "@/lib/api-client";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/context/toast-context";

interface UserRow {
  id: string;
  username: string;
  name: string;
  email: string;
  isAdmin: boolean;
}

export default function UsersPage() {
  const router = useRouter();
  const { user, getHeaders, isChecked } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"new" | "edit">("new");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPwd, setFormPwd] = useState("");
  const [formError, setFormError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const { pushToast } = useToast();

  useEffect(() => {
    if (!isChecked || !user) {
      router.replace("/login");
      return;
    }
    if (!user.isAdmin) {
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
    setFormError("");
    setModalOpen(true);
  }

  function openEditModal(u: UserRow) {
    setModalMode("edit");
    setEditingId(u.id);
    setFormName(u.name);
    setFormEmail(u.email);
    setFormPwd("");
    setFormError("");
    setModalOpen(true);
  }

  async function createUser() {
    setFormError("");
    if (!formName.trim() || !formEmail.trim() || !formPwd) {
      setFormError("Preencha todos os campos.");
      return;
    }
    if (formPwd.length < 4) {
      setFormError("Senha deve ter pelo menos 4 caracteres.");
      return;
    }
    try {
      await apiPost("/api/users", {
        name: formName.trim(),
        email: formEmail.trim(),
        password: formPwd,
      }, getHeaders());
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
    const body: { name: string; password?: string } = { name: formName.trim() };
    if (formPwd.length >= 4) body.password = formPwd;
    try {
      await apiPut(`/api/users/${editingId}`, body, getHeaders());
      setModalOpen(false);
      loadUsers();
    } catch (e) {
      setFormError(e instanceof ApiError ? (e.data as { error?: string })?.error ?? e.message : "Erro ao salvar.");
    }
  }

  async function deleteUser(id: string, name: string) {
    setConfirmDelete({ id, name });
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[var(--flux-surface-dark)]">
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
          <div className="bg-[var(--flux-surface-card)] border border-[rgba(108,92,231,0.2)] rounded-[var(--flux-rad)] shadow-[var(--shadow-md)] overflow-hidden">
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
                    className="border-b border-[rgba(255,255,255,0.06)] hover:bg-[rgba(108,92,231,0.06)]"
                  >
                    <td className="px-4 py-3 text-[var(--flux-text)]">{u.name}</td>
                    <td className="px-4 py-3 text-[var(--flux-text-muted)]">{u.email}</td>
                    <td className="px-4 py-3">
                      {u.isAdmin ? (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-[var(--flux-primary)] text-white">
                          Admin
                        </span>
                      ) : (
                        "Usuário"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {u.id !== "admin" ? (
                        <div className="flex gap-3">
                          <button
                            onClick={() => openEditModal(u)}
                            className="btn-sm border-[rgba(255,255,255,0.12)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)] hover:bg-[rgba(108,92,231,0.1)] hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)]"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => deleteUser(u.id, u.name)}
                            className="btn-sm border-[rgba(255,255,255,0.12)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)] hover:bg-[rgba(255,107,107,0.12)] hover:border-[var(--flux-danger)] hover:text-[var(--flux-danger)]"
                          >
                            Excluir
                          </button>
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
          className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="bg-[var(--flux-surface-card)] border border-[rgba(108,92,231,0.2)] rounded-[var(--flux-rad)] p-6 min-w-[360px] max-w-[95%]"
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
                  className="w-full px-3 py-2 border border-[rgba(255,255,255,0.12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] focus:border-[var(--flux-primary)] outline-none"
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
                  disabled={modalMode === "edit"}
                  className="w-full px-3 py-2 border border-[rgba(255,255,255,0.12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] disabled:opacity-60 focus:border-[var(--flux-primary)] outline-none"
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
                  placeholder={modalMode === "edit" ? "Deixe em branco para manter" : "Mínimo 4 caracteres"}
                  className="w-full px-3 py-2 border border-[rgba(255,255,255,0.12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] focus:border-[var(--flux-primary)] outline-none"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-[rgba(255,255,255,0.08)]">
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
