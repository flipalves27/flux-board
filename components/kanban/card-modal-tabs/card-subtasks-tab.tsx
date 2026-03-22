"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { KeyboardSensor } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useBoardStore } from "@/stores/board-store";
import { apiFetch, getApiHeaders } from "@/lib/api-client";
import { useCardModal } from "@/components/kanban/card-modal-context";
import type { SubtaskData } from "@/lib/schemas";
import { useTranslations } from "next-intl";

type SubtaskStatus = "pending" | "in_progress" | "done" | "blocked";

const STATUS_CYCLE: Record<SubtaskStatus, SubtaskStatus> = {
  pending: "in_progress",
  in_progress: "done",
  done: "blocked",
  blocked: "pending",
};

const STATUS_LABELS: Record<SubtaskStatus, string> = {
  pending: "Pendente",
  in_progress: "Em andamento",
  done: "Concluída",
  blocked: "Bloqueada",
};

const STATUS_COLORS: Record<SubtaskStatus, string> = {
  pending: "var(--flux-text-muted)",
  in_progress: "var(--flux-primary)",
  done: "var(--flux-success)",
  blocked: "var(--flux-danger)",
};

function nanoid12(): string {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 8);
}

function SubtaskItem({
  subtask,
  onToggleStatus,
  onUpdateTitle,
  onDelete,
}: {
  subtask: SubtaskData;
  onToggleStatus: (id: string) => void;
  onUpdateTitle: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: subtask.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(subtask.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commitEdit = () => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== subtask.title) onUpdateTitle(subtask.id, trimmed);
    else setTitle(subtask.title);
    setEditing(false);
  };

  const indented = Boolean(subtask.parentSubtaskId);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-lg border border-[var(--flux-chrome-alpha-06)] bg-[var(--flux-surface-elevated)] px-3 py-2 group ${indented ? "ml-6" : ""}`}
    >
      {/* Drag handle */}
      <button
        type="button"
        {...listeners}
        {...attributes}
        className="shrink-0 cursor-grab text-[var(--flux-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Reordenar"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5" aria-hidden>
          <circle cx="9" cy="7" r="1" fill="currentColor" />
          <circle cx="9" cy="12" r="1" fill="currentColor" />
          <circle cx="9" cy="17" r="1" fill="currentColor" />
          <circle cx="15" cy="7" r="1" fill="currentColor" />
          <circle cx="15" cy="12" r="1" fill="currentColor" />
          <circle cx="15" cy="17" r="1" fill="currentColor" />
        </svg>
      </button>

      {/* Status toggle */}
      <button
        type="button"
        onClick={() => onToggleStatus(subtask.id)}
        className="shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all duration-200"
        style={{ borderColor: STATUS_COLORS[subtask.status], background: subtask.status === "done" ? STATUS_COLORS.done : "transparent" }}
        title={`Status: ${STATUS_LABELS[subtask.status]} (clique para avançar)`}
        aria-label={`Status da subtask: ${STATUS_LABELS[subtask.status]}`}
      >
        {subtask.status === "done" && (
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="w-2.5 h-2.5" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
        {subtask.status === "blocked" && (
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_COLORS.blocked }} />
        )}
      </button>

      {/* Title */}
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit();
            if (e.key === "Escape") { setTitle(subtask.title); setEditing(false); }
          }}
          className="flex-1 min-w-0 bg-transparent text-sm text-[var(--flux-text)] outline-none border-b border-[var(--flux-primary)] py-0.5"
          maxLength={300}
        />
      ) : (
        <span
          className={`flex-1 min-w-0 text-sm text-[var(--flux-text)] cursor-text truncate ${subtask.status === "done" ? "line-through opacity-60" : ""}`}
          onDoubleClick={() => setEditing(true)}
          title="Duplo-clique para editar"
        >
          {subtask.title}
        </span>
      )}

      {/* Status label */}
      <span
        className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
        style={{ color: STATUS_COLORS[subtask.status], background: `color-mix(in srgb, ${STATUS_COLORS[subtask.status]} 12%, transparent)` }}
      >
        {STATUS_LABELS[subtask.status]}
      </span>

      {/* Delete */}
      <button
        type="button"
        onClick={() => onDelete(subtask.id)}
        className="shrink-0 w-5 h-5 rounded flex items-center justify-center text-[var(--flux-danger)] opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[var(--flux-danger-alpha-15)]"
        aria-label="Remover subtask"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3" aria-hidden>
          <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

export default function CardSubtasksTab({ cardId }: { cardId: string }) {
  const { boardId, getHeaders } = useCardModal();
  const card = useBoardStore((s) => s.db?.cards.find((c) => c.id === cardId));
  const updateDb = useBoardStore((s) => s.updateDb);

  const rawSubtasks = (card as Record<string, unknown> | undefined)?.subtasks;
  const [subtasks, setSubtasks] = useState<SubtaskData[]>(() =>
    Array.isArray(rawSubtasks) ? (rawSubtasks as SubtaskData[]) : []
  );
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const newInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (Array.isArray(rawSubtasks)) setSubtasks(rawSubtasks as SubtaskData[]);
  }, [rawSubtasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const persistSubtasks = useCallback(
    async (updated: SubtaskData[]) => {
      if (!card) return;
      setSaving(true);
      try {
        const patch = { ...card, subtasks: updated };
        const res = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}/cards/${encodeURIComponent(cardId)}`, {
          method: "PATCH",
          body: JSON.stringify({ subtasks: updated }),
          headers: getApiHeaders(getHeaders()),
        });
        if (res.ok) {
          updateDb((db) => {
            const idx = db.cards.findIndex((c) => c.id === cardId);
            if (idx >= 0) (db.cards[idx] as Record<string, unknown>).subtasks = updated;
          });
        }
      } finally {
        setSaving(false);
      }
    },
    [boardId, card, cardId, getHeaders, updateDb]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = subtasks.findIndex((s) => s.id === active.id);
      const newIndex = subtasks.findIndex((s) => s.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      const reordered = arrayMove(subtasks, oldIndex, newIndex).map((s, i) => ({ ...s, order: i }));
      setSubtasks(reordered);
      void persistSubtasks(reordered);
    },
    [subtasks, persistSubtasks]
  );

  const handleToggleStatus = useCallback(
    (id: string) => {
      const updated = subtasks.map((s) =>
        s.id === id
          ? {
              ...s,
              status: STATUS_CYCLE[s.status],
              completedAt: STATUS_CYCLE[s.status] === "done" ? new Date().toISOString() : null,
            }
          : s
      );
      setSubtasks(updated);
      void persistSubtasks(updated);
    },
    [subtasks, persistSubtasks]
  );

  const handleUpdateTitle = useCallback(
    (id: string, title: string) => {
      const updated = subtasks.map((s) => (s.id === id ? { ...s, title } : s));
      setSubtasks(updated);
      void persistSubtasks(updated);
    },
    [subtasks, persistSubtasks]
  );

  const handleDelete = useCallback(
    (id: string) => {
      const updated = subtasks.filter((s) => s.id !== id).map((s, i) => ({ ...s, order: i }));
      setSubtasks(updated);
      void persistSubtasks(updated);
    },
    [subtasks, persistSubtasks]
  );

  const handleAddSubtask = useCallback(async () => {
    const title = newTitle.trim();
    if (!title) return;
    const newSubtask: SubtaskData = {
      id: nanoid12(),
      title,
      status: "pending",
      assigneeId: null,
      dueDate: null,
      priority: "medium",
      order: subtasks.length,
      estimateHours: null,
      completedAt: null,
      createdAt: new Date().toISOString(),
      parentSubtaskId: null,
    };
    const updated = [...subtasks, newSubtask];
    setSubtasks(updated);
    setNewTitle("");
    setAdding(false);
    void persistSubtasks(updated);
  }, [newTitle, subtasks, persistSubtasks]);

  const handleGenerateAI = useCallback(async () => {
    if (!card) return;
    setAiLoading(true);
    try {
      const res = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}/smart-card-enrich`, {
        method: "POST",
        body: JSON.stringify({ cardId, mode: "decompose" }),
        headers: getApiHeaders(getHeaders()),
      });
      if (res.ok) {
        const data = (await res.json()) as { subtasks?: SubtaskData[] };
        if (Array.isArray(data.subtasks) && data.subtasks.length > 0) {
          const generated: SubtaskData[] = data.subtasks.map((s, i) => ({
            ...s,
            id: nanoid12(),
            order: subtasks.length + i,
            createdAt: new Date().toISOString(),
          }));
          const updated = [...subtasks, ...generated];
          setSubtasks(updated);
          void persistSubtasks(updated);
        }
      }
    } finally {
      setAiLoading(false);
    }
  }, [boardId, card, cardId, getHeaders, subtasks, persistSubtasks]);

  const done = subtasks.filter((s) => s.status === "done").length;
  const total = subtasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const topLevel = subtasks.filter((s) => !s.parentSubtaskId);
  const children = subtasks.filter((s) => Boolean(s.parentSubtaskId));
  const ordered = [
    ...topLevel.sort((a, b) => a.order - b.order),
    ...children.sort((a, b) => a.order - b.order),
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display font-semibold text-sm text-[var(--flux-text)]">
            Subtasks{total > 0 ? ` (${done}/${total} — ${pct}%)` : ""}
          </h3>
          {total > 0 && (
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-[var(--flux-chrome-alpha-06)] overflow-hidden max-w-[200px]">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: pct === 100 ? "var(--flux-success)" : "var(--flux-primary)" }}
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {saving && (
            <span className="text-[11px] text-[var(--flux-text-muted)] animate-pulse">Salvando…</span>
          )}
          <button
            type="button"
            onClick={handleGenerateAI}
            disabled={aiLoading || !card}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-08)] px-3 py-1.5 text-xs font-semibold text-[var(--flux-primary-light)] hover:bg-[var(--flux-primary-alpha-15)] disabled:opacity-50 transition-all"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            {aiLoading ? "Gerando…" : "Gerar com IA"}
          </button>
        </div>
      </div>

      {/* Subtask list */}
      {ordered.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={ordered.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5">
              {ordered.map((subtask) => (
                <SubtaskItem
                  key={subtask.id}
                  subtask={subtask}
                  onToggleStatus={handleToggleStatus}
                  onUpdateTitle={handleUpdateTitle}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--flux-chrome-alpha-10)] py-8 text-center text-sm text-[var(--flux-text-muted)]">
          Nenhuma subtask ainda. Adicione manualmente ou gere com IA.
        </div>
      )}

      {/* Add subtask */}
      {adding ? (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--flux-primary-alpha-22)] bg-[var(--flux-primary-alpha-04)] px-3 py-2">
          <input
            ref={newInputRef}
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAddSubtask();
              if (e.key === "Escape") { setAdding(false); setNewTitle(""); }
            }}
            placeholder="Título da subtask…"
            className="flex-1 min-w-0 bg-transparent text-sm text-[var(--flux-text)] outline-none placeholder:text-[var(--flux-text-muted)]"
            maxLength={300}
            autoFocus
          />
          <button
            type="button"
            onClick={() => void handleAddSubtask()}
            className="shrink-0 rounded-full bg-[var(--flux-primary)] px-3 py-1 text-xs font-semibold text-white hover:bg-[var(--flux-primary-light)] transition-colors"
          >
            Adicionar
          </button>
          <button
            type="button"
            onClick={() => { setAdding(false); setNewTitle(""); }}
            className="shrink-0 text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
            aria-label="Cancelar"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4" aria-hidden>
              <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => { setAdding(true); setTimeout(() => newInputRef.current?.focus(), 50); }}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--flux-chrome-alpha-10)] px-3 py-2 text-sm text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-primary-light)] transition-all w-full"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 shrink-0" aria-hidden>
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          Adicionar subtask
        </button>
      )}
    </div>
  );
}
