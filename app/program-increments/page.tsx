"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { Header } from "@/components/header";
import { ReportsRouteLoadingFallback } from "@/components/skeletons/route-loading-fallbacks";
import type { ProgramIncrementData } from "@/lib/schemas";

const STATUS_LABELS: Record<string, string> = {
  planning: "Planejamento",
  executing: "Em Execução",
  review: "Revisão",
  closed: "Fechado",
};

const STATUS_COLORS: Record<string, string> = {
  planning: "var(--flux-text-muted)",
  executing: "var(--flux-primary)",
  review: "var(--flux-warning)",
  closed: "var(--flux-success)",
};

function PICard({ pi, onEdit, onDelete }: { pi: ProgramIncrementData; onEdit: (pi: ProgramIncrementData) => void; onDelete: (id: string) => void }) {
  const dateRange = [pi.startDate, pi.endDate].filter(Boolean).join(" → ") || "Datas não definidas";
  const boardCount = pi.boardIds.length;
  const sprintCount = pi.sprintIds.length;

  return (
    <div className="rounded-xl border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-card)] p-5 flex flex-col gap-3 hover:border-[var(--flux-chrome-alpha-15)] transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-semibold text-sm text-[var(--flux-text)] truncate">{pi.name}</h3>
          {pi.goal && <p className="text-xs text-[var(--flux-text-muted)] mt-1 line-clamp-2">{pi.goal}</p>}
        </div>
        <span className="shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full border" style={{ color: STATUS_COLORS[pi.status] ?? "inherit", borderColor: STATUS_COLORS[pi.status] ?? "inherit" }}>
          {STATUS_LABELS[pi.status] ?? pi.status}
        </span>
      </div>
      <p className="text-[11px] text-[var(--flux-text-muted)]">{dateRange}</p>
      <div className="flex items-center gap-4 text-[11px] text-[var(--flux-text-muted)]">
        <span>{boardCount} board{boardCount !== 1 ? "s" : ""}</span>
        <span>{sprintCount} sprint{sprintCount !== 1 ? "s" : ""}</span>
      </div>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={() => onEdit(pi)} className="btn-secondary text-xs flex-1">Editar</button>
        <button type="button" onClick={() => onDelete(pi.id)} className="text-xs px-3 py-1.5 rounded-lg border border-[var(--flux-danger-alpha-25)] text-[var(--flux-danger)] hover:bg-[var(--flux-danger-alpha-08)] transition-colors">Excluir</button>
      </div>
    </div>
  );
}

function PIForm({ initial, onSave, onCancel }: { initial?: Partial<ProgramIncrementData>; onSave: (data: Partial<ProgramIncrementData>) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [goal, setGoal] = useState(initial?.goal ?? "");
  const [status, setStatus] = useState<ProgramIncrementData["status"]>(initial?.status ?? "planning");
  const [startDate, setStartDate] = useState(initial?.startDate ?? "");
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave({ name, goal, status, startDate: startDate || null, endDate: endDate || null }); }} className="flex flex-col gap-4">
      <div>
        <label className="block text-xs font-medium text-[var(--flux-text-muted)] mb-1">Nome *</label>
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} className="input-base w-full" placeholder="PI 2026-Q1" />
      </div>
      <div>
        <label className="block text-xs font-medium text-[var(--flux-text-muted)] mb-1">Objetivo</label>
        <textarea value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={1000} rows={3} className="input-base w-full resize-none" placeholder="Descreva o objetivo do PI..." />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-[var(--flux-text-muted)] mb-1">Data Início</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input-base w-full" />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--flux-text-muted)] mb-1">Data Fim</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input-base w-full" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-[var(--flux-text-muted)] mb-1">Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value as ProgramIncrementData["status"])} className="input-base w-full">
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary text-sm">Cancelar</button>
        <button type="submit" className="btn-primary text-sm">Salvar</button>
      </div>
    </form>
  );
}

export default function ProgramIncrementsPage() {
  const router = useRouter();
  const { user, isChecked } = useAuth();
  const locale = useLocale();
  const localeRoot = `/${locale}`;

  const [pis, setPIs] = useState<ProgramIncrementData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingPI, setEditingPI] = useState<ProgramIncrementData | null>(null);

  const orgId = user?.orgId ?? "";

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/program-increments`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { programIncrements: ProgramIncrementData[] };
      setPIs(data.programIncrements ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar PIs");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (!isChecked) return;
    if (!user) { router.replace(`${localeRoot}/login`); return; }
    load();
  }, [isChecked, user, router, localeRoot, load]);

  const handleCreate = async (data: Partial<ProgramIncrementData>) => {
    const res = await fetch(`/api/orgs/${orgId}/program-increments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) { setShowForm(false); load(); }
    else setError(await res.text());
  };

  const handleUpdate = async (data: Partial<ProgramIncrementData>) => {
    if (!editingPI) return;
    const res = await fetch(`/api/orgs/${orgId}/program-increments/${editingPI.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) { setEditingPI(null); load(); }
    else setError(await res.text());
  };

  const handleDelete = async (piId: string) => {
    if (!confirm("Excluir este Program Increment?")) return;
    const res = await fetch(`/api/orgs/${orgId}/program-increments/${piId}`, { method: "DELETE" });
    if (res.ok) load();
    else setError(await res.text());
  };

  if (!isChecked || !user) return <ReportsRouteLoadingFallback />;

  return (
    <div className="min-h-screen bg-[var(--flux-surface-dark)]">
      <Header />
      <main className="max-w-5xl mx-auto px-4 pt-8 pb-16">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display font-bold text-2xl text-[var(--flux-text)]">Program Increments</h1>
            <p className="text-sm text-[var(--flux-text-muted)] mt-1">Gerencie ciclos de planejamento multi-board (SAFe PI).</p>
          </div>
          <button type="button" onClick={() => setShowForm(true)} className="btn-primary text-sm">+ Novo PI</button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-[var(--flux-danger-alpha-25)] bg-[var(--flux-danger-alpha-08)] px-4 py-3 text-sm text-[var(--flux-danger)]">
            {error}
          </div>
        )}

        {(showForm || editingPI) && (
          <div className="mb-6 rounded-xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] p-6">
            <h2 className="font-semibold text-base text-[var(--flux-text)] mb-4">{editingPI ? "Editar Program Increment" : "Novo Program Increment"}</h2>
            <PIForm
              initial={editingPI ?? undefined}
              onSave={editingPI ? handleUpdate : handleCreate}
              onCancel={() => { setShowForm(false); setEditingPI(null); }}
            />
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-card)] h-40 animate-pulse" />
            ))}
          </div>
        ) : pis.length === 0 ? (
          <div className="text-center py-20 text-[var(--flux-text-muted)]">
            <p className="text-4xl mb-3">🗓️</p>
            <p className="font-medium">Nenhum Program Increment criado ainda.</p>
            <p className="text-sm mt-1">Crie um PI para organizar sprints e boards em ciclos maiores.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pis.map((pi) => (
              <PICard
                key={pi.id}
                pi={pi}
                onEdit={(p) => { setEditingPI(p); setShowForm(false); }}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
