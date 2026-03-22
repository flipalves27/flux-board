"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, getApiHeaders } from "@/lib/api-client";
import type { BoardMember, BoardRole } from "@/lib/kv-board-members";

type Props = {
  boardId: string;
  getHeaders: () => Record<string, string>;
  open: boolean;
  onClose: () => void;
};

const ROLE_LABELS: Record<BoardRole, string> = {
  viewer: "Visualizador",
  editor: "Editor",
  admin: "Administrador",
};

export function BoardMembersPanel({ boardId, getHeaders, open, onClose }: Props) {
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<BoardRole>("editor");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}/members`, {
        headers: getApiHeaders(getHeaders()),
      });
      if (res.ok) {
        const data = await res.json() as { members: BoardMember[] };
        setMembers(data.members ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [boardId, getHeaders, open]);

  useEffect(() => { void load(); }, [load]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId.trim() || !username.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}/members`, {
        method: "POST",
        body: JSON.stringify({ userId: userId.trim(), username: username.trim(), role }),
        headers: getApiHeaders(getHeaders()),
      });
      if (res.ok) {
        const data = await res.json() as { member: BoardMember };
        setMembers((prev) => {
          const existing = prev.findIndex((m) => m.userId === data.member.userId);
          if (existing >= 0) { const next = [...prev]; next[existing] = data.member; return next; }
          return [...prev, data.member];
        });
        setUserId(""); setUsername("");
      } else {
        const d = await res.json().catch(() => ({ error: "Erro" })) as { error?: string };
        setError(d.error ?? "Erro ao adicionar membro");
      }
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (targetUserId: string) => {
    const res = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}/members/${encodeURIComponent(targetUserId)}`, {
      method: "DELETE",
      headers: getApiHeaders(getHeaders()),
    });
    if (res.ok) setMembers((prev) => prev.filter((m) => m.userId !== targetUserId));
  };

  const handleRoleChange = async (targetUserId: string, newRole: BoardRole) => {
    const res = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}/members/${encodeURIComponent(targetUserId)}`, {
      method: "PATCH",
      body: JSON.stringify({ role: newRole }),
      headers: getApiHeaders(getHeaders()),
    });
    if (res.ok) {
      const data = await res.json() as { member: BoardMember };
      setMembers((prev) => prev.map((m) => m.userId === targetUserId ? data.member : m));
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[320] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative z-10 w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-[var(--flux-surface-card)] border border-[var(--flux-chrome-alpha-08)] shadow-[var(--flux-shadow-modal-depth)] flex flex-col max-h-[85dvh]">
        <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--flux-chrome-alpha-06)]">
          <h2 className="font-display font-bold text-base text-[var(--flux-text)]">Membros do Board</h2>
          <button type="button" onClick={onClose} className="h-7 w-7 rounded-full border border-[var(--flux-chrome-alpha-10)] text-[var(--flux-text-muted)] flex items-center justify-center hover:bg-[var(--flux-chrome-alpha-06)]" aria-label="Fechar">✕</button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-flux px-5 py-4 space-y-5">
          {error && (
            <p className="text-sm text-[var(--flux-danger)] bg-[var(--flux-danger-alpha-08)] border border-[var(--flux-danger-alpha-25)] rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Add member form */}
          <form onSubmit={handleAdd} className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">Adicionar Membro</p>
            <div className="grid grid-cols-2 gap-2">
              <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="User ID" className="input-base text-sm" maxLength={200} />
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Nome de usuário" className="input-base text-sm" maxLength={200} />
            </div>
            <div className="flex items-center gap-2">
              <select value={role} onChange={(e) => setRole(e.target.value as BoardRole)} className="input-base text-sm flex-1">
                {(Object.keys(ROLE_LABELS) as BoardRole[]).map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
              <button type="submit" disabled={adding || !userId.trim() || !username.trim()} className="btn-primary text-sm px-4">
                {adding ? "…" : "Adicionar"}
              </button>
            </div>
          </form>

          {/* Member list */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)] mb-2">Membros ({members.length})</p>
            {loading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-[var(--flux-chrome-alpha-06)]" />)}</div>
            ) : members.length === 0 ? (
              <p className="text-sm text-[var(--flux-text-muted)] py-4 text-center">Nenhum membro adicionado.<br /><span className="text-xs">Quando vazio, o board é acessível apenas pelo dono.</span></p>
            ) : (
              <div className="space-y-2">
                {members.map((m) => (
                  <div key={m.userId} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--flux-chrome-alpha-06)] px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--flux-text)] truncate">{m.username}</p>
                      <p className="text-[11px] text-[var(--flux-text-muted)] truncate">{m.userId}</p>
                    </div>
                    <select
                      value={m.role}
                      onChange={(e) => void handleRoleChange(m.userId, e.target.value as BoardRole)}
                      className="text-xs rounded-lg border border-[var(--flux-chrome-alpha-10)] bg-transparent text-[var(--flux-text-muted)] px-2 py-1"
                    >
                      {(Object.keys(ROLE_LABELS) as BoardRole[]).map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                    <button type="button" onClick={() => void handleRemove(m.userId)} className="shrink-0 text-[var(--flux-danger)] text-xs hover:opacity-70 transition-opacity">
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
