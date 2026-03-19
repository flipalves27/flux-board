"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/header";
import { useAuth } from "@/context/auth-context";
import { RoutineTaskInput, RoutineType, useRoutineTasks } from "@/context/routine-tasks-context";
import { ALERT_SOUND_PRESETS, DEFAULT_ALERT_SOUND_ID, playAlertSound } from "@/lib/alert-sounds";

const WEEKDAYS = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
];

const ALERT_OPTIONS = [5, 10, 15, 30, 60, 120];

const defaultTaskInput: RoutineTaskInput = {
  title: "",
  notes: "",
  category: "Rotina",
  recurrence: "daily",
  time: "09:00",
  weekdays: [1, 2, 3, 4, 5],
  dayOfMonth: 1,
  alertBeforeMinutes: 15,
  alertSound: DEFAULT_ALERT_SOUND_ID,
  active: true,
};

function recurrenceLabel(type: RoutineType): string {
  if (type === "daily") return "Diária";
  if (type === "weekly") return "Semanal";
  return "Mensal";
}

export default function TasksPage() {
  const router = useRouter();
  const { user, isChecked } = useAuth();
  const { tasks, createTask, updateTask, deleteTask, toggleTask, completeTask } = useRoutineTasks();

  const [form, setForm] = useState<RoutineTaskInput>(defaultTaskInput);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isChecked || !user) {
      router.replace("/login");
    }
  }, [isChecked, user, router]);

  const sortedTasks = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return new Date(a.nextDueAt).getTime() - new Date(b.nextDueAt).getTime();
      }),
    [tasks]
  );

  function resetForm() {
    setForm(defaultTaskInput);
    setEditingId(null);
  }

  function submitTask(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    if (editingId) {
      updateTask(editingId, { ...form, title: form.title.trim() });
      resetForm();
      return;
    }
    createTask({ ...form, title: form.title.trim() });
    resetForm();
  }

  function loadForEdit(taskId: string) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    setEditingId(task.id);
    setForm({
      title: task.title,
      notes: task.notes,
      category: task.category,
      recurrence: task.recurrence,
      time: task.time,
      weekdays: task.weekdays,
      dayOfMonth: task.dayOfMonth,
      alertBeforeMinutes: task.alertBeforeMinutes,
      alertSound: task.alertSound,
      active: task.active,
    });
  }

  function toggleWeekday(day: number) {
    setForm((prev) => {
      const exists = prev.weekdays.includes(day);
      const next = exists ? prev.weekdays.filter((d) => d !== day) : [...prev.weekdays, day];
      return { ...prev, weekdays: next.sort((a, b) => a - b) };
    });
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[var(--flux-surface-dark)]">
      <Header title="Minhas tarefas" />
      <main className="max-w-[1300px] mx-auto px-6 py-7 grid grid-cols-1 xl:grid-cols-[410px,1fr] gap-6">
        <section className="bg-[var(--flux-surface-card)] border border-[rgba(108,92,231,0.2)] rounded-[var(--flux-rad-lg)] p-5">
          <h2 className="font-display font-bold text-lg text-[var(--flux-text)]">
            {editingId ? "Editar rotina" : "Nova tarefa rotineira"}
          </h2>
          <p className="text-sm text-[var(--flux-text-muted)] mt-1 mb-5">
            Crie tarefas recorrentes em poucos cliques, com alertas discretos e visíveis no app.
          </p>

          <form onSubmit={submitTask} className="space-y-3">
            <div className="rounded-[var(--flux-rad)] border border-[rgba(108,92,231,0.16)] bg-[linear-gradient(180deg,rgba(108,92,231,0.1),rgba(108,92,231,0.03))] p-3">
              <p className="text-xs text-[var(--flux-primary-light)] font-semibold font-display uppercase tracking-wide mb-2">
                Configuracao rapida
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      recurrence: "daily",
                      weekdays: [1, 2, 3, 4, 5],
                      dayOfMonth: 1,
                    }))
                  }
                  className="text-left rounded-[var(--flux-rad)] border border-[rgba(108,92,231,0.25)] bg-[var(--flux-surface-elevated)] px-3 py-2.5 hover:border-[var(--flux-primary)] transition-colors"
                >
                  <p className="text-sm font-semibold text-[var(--flux-text)]">Rotina diaria</p>
                  <p className="text-xs text-[var(--flux-text-muted)] mt-1">Todo dia no horario escolhido</p>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      recurrence: "weekly",
                      weekdays: [1, 2, 3, 4, 5],
                    }))
                  }
                  className="text-left rounded-[var(--flux-rad)] border border-[rgba(108,92,231,0.25)] bg-[var(--flux-surface-elevated)] px-3 py-2.5 hover:border-[var(--flux-primary)] transition-colors"
                >
                  <p className="text-sm font-semibold text-[var(--flux-text)]">Seg a sex</p>
                  <p className="text-xs text-[var(--flux-text-muted)] mt-1">Ideal para rituais de trabalho</p>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">Título</label>
              <input
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Ex: Revisar backlog diário"
                className="w-full px-3 py-2 rounded-[var(--flux-rad)] border border-[rgba(108,92,231,0.2)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">Categoria</label>
                <input
                  value={form.category}
                  onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                  placeholder="Ex: Operação"
                  className="w-full px-3 py-2 rounded-[var(--flux-rad)] border border-[rgba(108,92,231,0.2)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">Recorrência</label>
                <select
                  value={form.recurrence}
                  onChange={(e) => setForm((prev) => ({ ...prev, recurrence: e.target.value as RoutineType }))}
                  className="w-full px-3 py-2 rounded-[var(--flux-rad)] border border-[rgba(108,92,231,0.2)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                >
                  <option value="daily">Diária</option>
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensal</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">Horário</label>
                <input
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm((prev) => ({ ...prev, time: e.target.value }))}
                  className="w-full px-3 py-2 rounded-[var(--flux-rad)] border border-[rgba(108,92,231,0.2)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">Alertar antes</label>
                <select
                  value={form.alertBeforeMinutes}
                  onChange={(e) => setForm((prev) => ({ ...prev, alertBeforeMinutes: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-[var(--flux-rad)] border border-[rgba(108,92,231,0.2)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                >
                  {ALERT_OPTIONS.map((mins) => (
                    <option key={mins} value={mins}>
                      {mins} min
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">Som do alerta</label>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto] gap-2">
                <select
                  value={form.alertSound}
                  onChange={(e) => setForm((prev) => ({ ...prev, alertSound: e.target.value }))}
                  className="w-full px-3 py-2 rounded-[var(--flux-rad)] border border-[rgba(108,92,231,0.2)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                >
                  {ALERT_SOUND_PRESETS.map((sound) => (
                    <option key={sound.id} value={sound.id}>
                      {sound.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => playAlertSound(form.alertSound)}
                  className="btn-secondary whitespace-nowrap"
                >
                  Testar som
                </button>
              </div>
              <p className="text-[11px] text-[var(--flux-text-muted)] mt-1">
                {ALERT_SOUND_PRESETS.length} opcoes suaves disponiveis para personalizar seus lembretes.
              </p>
            </div>

            {form.recurrence === "weekly" && (
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">Dias da semana</label>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((day) => {
                    const selected = form.weekdays.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleWeekday(day.value)}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                          selected
                            ? "bg-[rgba(108,92,231,0.25)] border-[var(--flux-primary)] text-[var(--flux-primary-light)]"
                            : "bg-[var(--flux-surface-elevated)] border-[rgba(108,92,231,0.2)] text-[var(--flux-text-muted)]"
                        }`}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {form.recurrence === "monthly" && (
              <div>
                <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">Dia do mês</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={form.dayOfMonth}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      dayOfMonth: Math.max(1, Math.min(31, Number(e.target.value) || 1)),
                    }))
                  }
                  className="w-full px-3 py-2 rounded-[var(--flux-rad)] border border-[rgba(108,92,231,0.2)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">Observações</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Checklist ou contexto da rotina..."
                rows={3}
                className="w-full px-3 py-2 rounded-[var(--flux-rad)] border border-[rgba(108,92,231,0.2)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)] resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              {editingId && (
                <button type="button" onClick={resetForm} className="btn-secondary">
                  Cancelar edição
                </button>
              )}
              <button className="btn-primary" type="submit">
                {editingId ? "Salvar rotina" : "Criar rotina"}
              </button>
            </div>
          </form>
        </section>

        <section className="bg-[var(--flux-surface-card)] border border-[rgba(108,92,231,0.2)] rounded-[var(--flux-rad-lg)] p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <h2 className="font-display font-bold text-lg text-[var(--flux-text)]">Agenda de rotinas</h2>
            <span className="text-xs text-[var(--flux-text-muted)]">{sortedTasks.length} tarefa(s)</span>
          </div>

          {sortedTasks.length === 0 ? (
            <p className="text-[var(--flux-text-muted)] text-sm">
              Nenhuma rotina criada ainda. Use o formulário ao lado para começar.
            </p>
          ) : (
            <div className="space-y-3">
              {sortedTasks.map((task) => (
                <article
                  key={task.id}
                  className="rounded-[var(--flux-rad)] border border-[rgba(108,92,231,0.2)] bg-[var(--flux-surface-elevated)] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-display font-semibold text-[var(--flux-text)]">{task.title}</h3>
                      <p className="text-xs text-[var(--flux-text-muted)] mt-1">
                        {task.category} - {recurrenceLabel(task.recurrence)} - {task.time}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleTask(task.id, !task.active)}
                      className={`px-2.5 py-1 rounded-full text-xs border ${
                        task.active
                          ? "border-[rgba(0,230,118,0.45)] text-[var(--flux-success)] bg-[rgba(0,230,118,0.12)]"
                          : "border-[rgba(255,255,255,0.16)] text-[var(--flux-text-muted)]"
                      }`}
                    >
                      {task.active ? "Ativa" : "Pausada"}
                    </button>
                  </div>

                  {task.notes && <p className="text-sm text-[var(--flux-text-muted)] mt-2">{task.notes}</p>}

                  <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-xs text-[var(--flux-text-muted)]">
                      <span>
                        Próximo alerta:{" "}
                        {new Date(task.nextDueAt).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="mx-1.5">-</span>
                      <span>
                        Som: {ALERT_SOUND_PRESETS.find((sound) => sound.id === task.alertSound)?.name ?? "Padrao"}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => completeTask(task.id)} className="btn-sm border-[rgba(0,230,118,0.3)] text-[var(--flux-success)]">
                        Concluir
                      </button>
                      <button type="button" onClick={() => loadForEdit(task.id)} className="btn-sm border-[rgba(108,92,231,0.4)] text-[var(--flux-primary-light)]">
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteTask(task.id)}
                        className="btn-sm border-[rgba(255,107,107,0.4)] text-[var(--flux-danger)]"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
