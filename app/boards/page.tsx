"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { Header } from "@/components/header";
import { apiGet, apiPost, apiPut, apiDelete, ApiError } from "@/lib/api-client";

interface Board {
  id: string;
  name: string;
  ownerId: string;
  lastUpdated?: string;
}

export default function BoardsPage() {
  const router = useRouter();
  const { user, getHeaders, isChecked } = useAuth();
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"new" | "edit">("new");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [boardName, setBoardName] = useState("");
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    if (!isChecked || !user) {
      router.replace("/login");
      return;
    }
    loadBoards();
  }, [isChecked, user, router]);

  async function loadBoards() {
    try {
      const data = await apiGet<{ boards: Board[] }>("/api/boards", getHeaders());
      const list = data.boards ?? [];
      setBoards(list);
      setEmpty(list.length === 0);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.replace("/login");
        return;
      }
      setBoards([]);
      setEmpty(true);
    } finally {
      setLoading(false);
    }
  }

  function openNewModal() {
    setModalMode("new");
    setEditingId(null);
    setBoardName("");
    setModalOpen(true);
  }

  function openEditModal(id: string, name: string) {
    setModalMode("edit");
    setEditingId(id);
    setBoardName(name);
    setModalOpen(true);
  }

  async function createBoard() {
    try {
      const name = boardName.trim() || "Novo Board";
      const { board } = await apiPost<{ board: Board }>("/api/boards", { name }, getHeaders());
      setModalOpen(false);
      router.push(`/board/${board.id}`);
    } catch {
      alert("Erro ao criar board.");
    }
  }

  async function saveBoardName() {
    if (!editingId) return;
    try {
      const name = boardName.trim() || "Board";
      await apiPut(`/api/boards/${editingId}`, { name }, getHeaders());
      setModalOpen(false);
      loadBoards();
    } catch {
      alert("Erro ao renomear.");
    }
  }

  async function deleteBoard(id: string, name: string) {
    if (!confirm(`Excluir o board "${name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await apiDelete(`/api/boards/${id}`, getHeaders());
      loadBoards();
    } catch {
      alert("Erro ao excluir.");
    }
  }

  function formatDate(s?: string) {
    if (!s) return "-";
    try {
      return new Date(s).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return s;
    }
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[var(--flux-surface-dark)]">
      <Header hideDiscovery />
      <main className="max-w-[1200px] mx-auto px-6 py-8">
        <h2 className="font-display text-xl font-bold text-[var(--flux-text)] mb-6">
          Meus Boards
        </h2>

        {loading ? (
          <p className="text-[var(--flux-text-muted)]">Carregando...</p>
        ) : (
          <>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
              <button
                onClick={openNewModal}
                className="bg-[var(--flux-surface-card)] border-2 border-dashed border-[rgba(108,92,231,0.3)] flex items-center justify-center min-h-[120px] text-[var(--flux-text-muted)] font-semibold rounded-[var(--flux-rad)] hover:bg-[rgba(108,92,231,0.08)] hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)] transition-all duration-200 cursor-pointer font-display"
              >
                + Novo Board
              </button>
              {boards.map((b) => {
                const isBoardReborn = b.id === "b_reborn";
                const isAdmin = user.isAdmin;
                return (
                  <div
                    key={b.id}
                    className="bg-[var(--flux-surface-card)] border border-[rgba(108,92,231,0.2)] rounded-[var(--flux-rad)] p-5 flex flex-col gap-2 cursor-pointer transition-all hover:shadow-[var(--shadow-md)] hover:border-[var(--flux-primary)]"
                    onClick={() => router.push(`/board/${b.id}`)}
                  >
                    <h3 className="font-display font-bold text-[var(--flux-text)]">{b.name}</h3>
                    <span className="text-xs text-[var(--flux-text-muted)]">
                      Atualizado: {formatDate(b.lastUpdated)}
                    </span>
                    {isBoardReborn ? (
                      isAdmin ? (
                        <div className="mt-auto pt-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteBoard(b.id, b.name);
                            }}
                            className="btn-sm border-[rgba(255,255,255,0.12)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)] hover:bg-[rgba(255,107,107,0.12)] hover:border-[var(--flux-danger)] hover:text-[var(--flux-danger)]"
                          >
                            Excluir
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--flux-text-muted)] italic">Board padrão</span>
                      )
                    ) : (
                      <div className="mt-auto pt-3 flex gap-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditModal(b.id, b.name);
                          }}
                          className="btn-sm border-[rgba(255,255,255,0.12)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)] hover:bg-[rgba(108,92,231,0.1)] hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)]"
                        >
                          Renomear
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteBoard(b.id, b.name);
                          }}
                          className="btn-sm border-[rgba(255,255,255,0.12)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)] hover:bg-[rgba(255,107,107,0.12)] hover:border-[var(--flux-danger)] hover:text-[var(--flux-danger)]"
                        >
                          Excluir
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {empty && boards.length === 0 && (
              <p className="text-center py-12 text-[var(--flux-text-muted)]">
                Nenhum board ainda. Clique em &quot;Novo Board&quot; para criar.
              </p>
            )}
          </>
        )}
      </main>

      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-[300] flex items-center justify-center"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="bg-[var(--flux-surface-card)] border border-[rgba(108,92,231,0.2)] rounded-[var(--flux-rad)] p-6 min-w-[320px] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display font-bold mb-4 text-[var(--flux-text)]">
              {modalMode === "new" ? "Novo Board" : "Renomear Board"}
            </h3>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">
                Nome do Board
              </label>
              <input
                type="text"
                value={boardName}
                onChange={(e) => setBoardName(e.target.value)}
                placeholder="Ex: Backlog Principal"
                className="w-full px-3 py-2 border border-[rgba(255,255,255,0.12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] focus:border-[var(--flux-primary)] outline-none"
                autoFocus
              />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => setModalOpen(false)}
                className="btn-secondary"
              >
                Cancelar
              </button>
              <button
                onClick={modalMode === "new" ? createBoard : saveBoardName}
                className="btn-primary"
              >
                {modalMode === "new" ? "Criar" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
