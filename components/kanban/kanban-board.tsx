"use client";

import { useState, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { KanbanColumn } from "./kanban-column";
import { KanbanCard } from "./kanban-card";
import { CardModal } from "./card-modal";
import { MapaModal } from "./mapa-modal";
import { DescModal } from "./desc-modal";
import type { BoardData, CardData, BucketConfig } from "@/app/board/[id]/page";

interface KanbanBoardProps {
  db: BoardData;
  updateDb: (updater: (prev: BoardData) => BoardData) => void;
  boardId: string;
  getHeaders: () => Record<string, string>;
  filterLabels: string[];
  priorities: string[];
  progresses: string[];
  directions: string[];
}

const DIR_COLORS: Record<string, string> = {
  manter: "#059669",
  priorizar: "#009E90",
  adiar: "#F59E0B",
  cancelar: "#EF4444",
  reavaliar: "#6B7280",
};

export function KanbanBoard({
  db,
  updateDb,
  boardId,
  getHeaders,
  filterLabels,
  priorities,
  progresses,
  directions,
}: KanbanBoardProps) {
  const [activePrio, setActivePrio] = useState("all");
  const [activeLabels, setActiveLabels] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [modalCard, setModalCard] = useState<CardData | null>(null);
  const [modalMode, setModalMode] = useState<"new" | "edit">("new");
  const [mapaOpen, setMapaOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    type: "card" | "bucket";
    id: string;
    label: string;
  } | null>(null);
  const [addColumnOpen, setAddColumnOpen] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [descModalCard, setDescModalCard] = useState<CardData | null>(null);

  const buckets = db.config.bucketOrder;
  const collapsed = new Set(db.config.collapsedColumns || []);
  const cards = db.cards;

  const filterCard = useCallback(
    (c: CardData) => {
      if (activePrio !== "all" && c.priority !== activePrio) return false;
      if (activeLabels.size > 0 && !c.tags.some((t) => activeLabels.has(t))) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          c.title.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q) ||
          (c.desc || "").toLowerCase().includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q))
        );
      }
      return true;
    },
    [activePrio, activeLabels, searchQuery]
  );

  const getCardsByBucket = (bucketKey: string) =>
    cards
      .filter((c) => c.bucket === bucketKey)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const visibleCardsByBucket = (bucketKey: string) =>
    getCardsByBucket(bucketKey).filter(filterCard);

  const COLUMN_COLORS = ["#9CA3AF", "#8B5CF6", "#0A1F3F", "#00C9B7", "#F97316", "#10B981", "#3B82F6", "#EC4899"];
  const addColumn = () => {
    const label = newColumnName.trim() || "Nova Coluna";
    const key = `col_${Date.now()}`;
    const color = COLUMN_COLORS[buckets.length % COLUMN_COLORS.length];
    updateDb((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        bucketOrder: [...prev.config.bucketOrder, { key, label, color }],
      },
    }));
    setNewColumnName("");
    setAddColumnOpen(false);
  };

  const deleteColumn = (key: string) => {
    const fallbackKey = buckets.find((b) => b.key !== key)?.key;
    updateDb((prev) => ({
      ...prev,
      cards: prev.cards.map((c) => (c.bucket === key && fallbackKey ? { ...c, bucket: fallbackKey } : c)),
      config: {
        ...prev.config,
        bucketOrder: prev.config.bucketOrder.filter((b) => b.key !== key),
        collapsedColumns: (prev.config.collapsedColumns || []).filter((k) => k !== key),
      },
    }));
    setConfirmDelete(null);
  };

  const toggleCollapsed = (key: string) => {
    const next = new Set(collapsed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    updateDb((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        collapsedColumns: [...next],
      },
    }));
  };

  const toggleLabel = (label: string) => {
    setActiveLabels((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const moveCard = (cardId: string, newBucket: string, newIndex: number) => {
    updateDb((prev) => {
      const card = prev.cards.find((c) => c.id === cardId);
      if (!card) return prev;
      const withoutCard = prev.cards.filter((c) => c.id !== cardId);
      const bucketCards = withoutCard
        .filter((c) => c.bucket === newBucket)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      bucketCards.splice(newIndex, 0, { ...card, bucket: newBucket });
      bucketCards.forEach((c, i) => (c.order = i));
      const otherBuckets = withoutCard.filter((c) => c.bucket !== newBucket);
      return { ...prev, cards: [...otherBuckets, ...bucketCards] };
    });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const reorderColumns = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    updateDb((prev) => {
      const newOrder = [...prev.config.bucketOrder];
      const [removed] = newOrder.splice(fromIndex, 1);
      newOrder.splice(toIndex, 0, removed);
      return { ...prev, config: { ...prev.config, bucketOrder: newOrder } };
    });
  };

  const parseSlotId = (id: string): { bucketKey: string; index: number } | null => {
    if (!id.startsWith("slot-")) return null;
    const rest = id.slice(5);
    const lastDash = rest.lastIndexOf("-");
    if (lastDash === -1) return null;
    const bucketKey = rest.slice(0, lastDash);
    const index = parseInt(rest.slice(lastDash + 1), 10);
    if (isNaN(index) || index < 0) return null;
    return { bucketKey, index };
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    if (!over) return;
    const overId = String(over.id);
    const activeId = String(active.id);

    // Coluna sendo arrastada
    const colIndex = buckets.findIndex((b) => b.key === activeId);
    if (colIndex >= 0) {
      const overColIndex = buckets.findIndex((b) => b.key === overId);
      if (overColIndex >= 0 && overColIndex !== colIndex) {
        reorderColumns(colIndex, overColIndex);
      }
      return;
    }

    // Card sendo arrastado
    if (activeId.startsWith("card-")) {
      const cardId = activeId.replace("card-", "");
      const slotInfo = parseSlotId(overId);
      if (slotInfo) {
        const card = cards.find((c) => c.id === cardId);
        const sameBucket = card?.bucket === slotInfo.bucketKey;
        const dragIndex = card ? getCardsByBucket(card.bucket).findIndex((c) => c.id === cardId) : -1;
        let insertIndex = slotInfo.index;
        if (sameBucket && dragIndex >= 0 && dragIndex < insertIndex) insertIndex--;
        moveCard(cardId, slotInfo.bucketKey, insertIndex);
        return;
      }
      if (overId.startsWith("bucket-")) {
        const newBucket = overId.replace("bucket-", "");
        const bucketCards = getCardsByBucket(newBucket).filter((c) => c.id !== cardId);
        moveCard(cardId, newBucket, bucketCards.length);
      }
    }
  };

  const directionCounts = directions.reduce(
    (acc, d) => {
      const key = d.toLowerCase();
      acc[key] = cards.filter((c) => c.direction === key).length;
      return acc;
    },
    {} as Record<string, number>
  );
  const totalWithDir = cards.filter((c) => c.direction).length;

  const handleExportCSV = () => {
    const sep = ";";
    const nl = "\r\n";
    const hdr = [
      "ID",
      "Coluna",
      "Prioridade",
      "Progresso",
      "Título",
      "Descrição",
      "Rótulos",
      "Direcionamento",
      "Data de Conclusão",
    ];
    let csv = hdr.join(sep) + nl;
    cards.forEach((c) => {
      csv += [
        c.id,
        c.bucket,
        c.priority,
        c.progress,
        `"${(c.title || "").replace(/"/g, '""')}"`,
        `"${(c.desc || "").replace(/"/g, '""')}"`,
        `"${(c.tags || []).join(", ")}"`,
        c.direction || "",
        c.dueDate || "",
      ].join(sep) + nl;
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = "backlog_reborn_export.csv";
    a.click();
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      let raw = (ev.target?.result as string) || "";
      if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
      const rows = raw.split(/\r?\n/).filter((r) => r.trim());
      if (rows.length < 2) {
        alert("CSV vazio.");
        return;
      }
      const parseRow = (line: string) => {
        const r: string[] = [];
        let c = "";
        let q = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') q = !q;
          else if (!q && (ch === ";" || ch === ",")) {
            r.push(c);
            c = "";
          } else c += ch;
        }
        r.push(c);
        return r;
      };
      const hdr = parseRow(rows[0]).map((h) => h.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
      const idx: Record<string, number> = {};
      hdr.forEach((h, i) => (idx[h] = i));
      const iT = idx["titulo"] ?? idx["título"] ?? -1;
      if (iT === -1) {
        alert("Coluna 'Título' não encontrada.");
        return;
      }
      const nc: CardData[] = [];
      for (let i = 1; i < rows.length; i++) {
        const c = parseRow(rows[i]);
        if (c.length < 2) continue;
        const g = (k: number) => (k >= 0 && c[k] !== undefined ? String(c[k]).trim() : "");
        const tagsRaw = g(idx["rotulos"] ?? idx["rótulos"] ?? -1);
        const tags = tagsRaw ? tagsRaw.split(/[;,]/).map((t) => t.trim()).filter(Boolean) : [];
        const bucketRaw = g(idx["coluna"] ?? -1) || "Backlog";
        const bucket = buckets.find((b) => b.key === bucketRaw || b.label === bucketRaw)?.key || "Backlog";
        let dirVal = g(idx["direcionamento"] ?? -1);
        dirVal = dirVal && directions.map((d) => d.toLowerCase()).includes(dirVal.toLowerCase()) ? dirVal.toLowerCase() : "";
        const prioVal = g(idx["prioridade"] ?? -1) || "Média";
        const prio = priorities.find((p) => p.toLowerCase() === prioVal.toLowerCase()) || "Média";
        const progVal = g(idx["progresso"] ?? -1) || "Não iniciado";
        const prog = progresses.find((p) => p.toLowerCase() === progVal.toLowerCase()) || "Não iniciado";
        nc.push({
          id: g(idx["id"] ?? -1) || `IMP-${i}`,
          bucket,
          priority: prio,
          progress: prog,
          title: g(iT),
          desc: g(idx["descricao"] ?? idx["descrição"] ?? -1) || "",
          tags,
          direction: dirVal || null,
          dueDate: g(idx["data de conclusao"] ?? idx["data de conclusão"] ?? idx["duedate"] ?? -1) || null,
          order: i - 1,
        });
      }
      if (!nc.length) {
        alert("Nenhum card.");
        return;
      }
      if (confirm(`Importar ${nc.length} cards? Substitui os atuais.`)) {
        const ordByBucket: Record<string, number> = {};
        nc.forEach((card) => {
          const bk = card.bucket;
          ordByBucket[bk] = ordByBucket[bk] || 0;
          card.order = ordByBucket[bk]++;
        });
        updateDb((prev) => ({ ...prev, cards: nc }));
      }
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  };

  const activeCard = activeId && activeId.startsWith("card-")
    ? cards.find((c) => c.id === activeId.replace("card-", ""))
    : null;

  return (
    <>
      <div className="bg-white border-b border-[var(--g200)]">
        <div className="max-w-[1900px] mx-auto px-6 py-4 flex items-center gap-6 overflow-x-auto flex-wrap">
          {buckets.map((b, i) => {
            const n = visibleCardsByBucket(b.key).length;
            return (
              <div key={b.key} className="flex items-center gap-2 shrink-0">
                {i > 0 && <div className="w-px h-5 bg-[var(--g200)]" />}
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ background: b.color || "#9CA3AF" }}
                  />
                  <span className="text-xs text-[var(--g500)] font-medium">{b.label || ""}</span>
                  <span className="font-display font-extrabold text-sm text-[var(--g800)]">{n}</span>
                </div>
              </div>
            );
          })}
          <div className="w-px h-5 bg-[var(--g200)]" />
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[var(--g700)]">Total</span>
            <span className="font-display font-extrabold text-sm text-[var(--teal-d)]">{cards.length}</span>
          </div>
        </div>
      </div>

      <div className="bg-white border-b border-[var(--g200)] sticky top-[50px] z-[150] shadow-[0_2px_8px_rgba(10,31,63,0.04)]">
        <div className="max-w-[1900px] mx-auto px-6 py-4 flex items-center gap-4 flex-wrap">
          <span className="text-xs font-semibold text-[var(--g400)] uppercase tracking-wider">
            Prioridade
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            {["all", ...priorities].map((p) => (
              <button
                key={p}
                onClick={() => setActivePrio(p)}
                className={`btn-pill transition-all duration-200 ${
                  activePrio === p
                    ? "bg-[var(--navy)] text-white border-[var(--navy)] shadow-sm"
                    : "bg-white text-[var(--g600)] border-[var(--g200)] hover:border-[var(--teal)] hover:text-[var(--teal-d)] hover:bg-[rgba(0,201,183,0.04)]"
                }`}
              >
                {p === "all" ? "Todas" : p}
              </button>
            ))}
          </div>
          <div className="w-px h-6 bg-[var(--g200)]" />
          <button
            onClick={() => setLabelsOpen(!labelsOpen)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-200 border-[var(--teal)] bg-[rgba(0,201,183,0.06)] text-[var(--teal-d)] hover:bg-[rgba(0,201,183,0.12)] hover:shadow-sm ${labelsOpen ? "open" : ""}`}
          >
            <span>Rótulos</span>
            <span className={`transition-transform duration-200 ${labelsOpen ? "rotate-180" : ""}`}>▼</span>
          </button>
          <div className="w-px h-6 bg-[var(--g200)]" />
          <button
            onClick={() => setMapaOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border border-[var(--g300)] bg-[var(--g50)] text-[var(--navy)] hover:bg-[var(--g100)] hover:border-[var(--teal)] hover:text-[var(--teal-d)] transition-all duration-200"
          >
            Mapa de Produção
          </button>
          <div className="flex items-center gap-3 ml-auto">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar..."
              className="px-3 py-2 rounded-lg border border-[var(--g200)] text-sm bg-[var(--g50)] w-[180px] focus:border-[var(--teal)] focus:ring-2 focus:ring-[rgba(0,201,183,0.2)] outline-none transition-all duration-200"
            />
          </div>
        </div>
        {labelsOpen && (
          <div className="max-w-[1900px] mx-auto px-6 py-4 flex gap-3 flex-wrap border-t border-[var(--g100)]">
            {filterLabels.map((l) => (
              <button
                key={l}
                onClick={() => toggleLabel(l)}
                className={`btn-pill transition-all duration-200 ${
                  activeLabels.has(l)
                    ? "bg-[var(--teal)] text-[var(--navy)] border-[var(--teal)] shadow-sm"
                    : "bg-white text-[var(--g600)] border-[var(--g200)] hover:border-[var(--teal)] hover:text-[var(--teal-d)] hover:bg-[rgba(0,201,183,0.04)]"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="max-w-[1900px] mx-auto px-6 py-3.5 pb-20 flex gap-3 overflow-x-auto min-h-[calc(100vh-155px)] items-start">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <button
            type="button"
            onClick={() => setAddColumnOpen(true)}
            className="shrink-0 min-w-[44px] w-[44px] h-[80px] rounded-lg border border-dashed border-[var(--g300)] bg-[var(--g50)] flex items-center justify-center text-[var(--g400)] hover:border-[var(--teal)] hover:text-[var(--teal-d)] hover:bg-[rgba(0,201,183,0.04)] transition-all cursor-pointer group opacity-80 hover:opacity-100"
            title="Nova coluna"
          >
            <span className="text-lg font-light group-hover:scale-110 transition-transform">+</span>
          </button>
          <SortableContext items={buckets.map((b) => b.key)} strategy={horizontalListSortingStrategy}>
            {buckets.map((b) => (
              <KanbanColumn
                key={b.key}
                bucket={b}
                cards={visibleCardsByBucket(b.key)}
                collapsed={collapsed.has(b.key)}
                onToggleCollapse={() => toggleCollapsed(b.key)}
                onAddCard={() => {
                  setModalCard({
                    id: "",
                    bucket: b.key,
                    priority: "Média",
                    progress: "Não iniciado",
                    title: "",
                    desc: "Sem descrição.",
                    tags: [],
                    direction: null,
                    dueDate: null,
                    order: getCardsByBucket(b.key).length,
                  });
                  setModalMode("new");
                }}
                onEditCard={(c) => {
                  setModalCard(c);
                  setModalMode("edit");
                }}
                onDeleteCard={(id) => setConfirmDelete({ type: "card", id, label: "" })}
                onDeleteColumn={buckets.length > 1 ? () => setConfirmDelete({ type: "bucket", id: b.key, label: b.label }) : undefined}
                onSetDirection={(cardId, dir) => {
                  updateDb((prev) => ({
                    ...prev,
                    cards: prev.cards.map((c) =>
                      c.id === cardId ? { ...c, direction: c.direction === dir ? null : dir } : c
                    ),
                  }));
                }}
                onOpenDesc={(c) => setDescModalCard(c)}
                directions={directions}
                dirColors={DIR_COLORS}
              />
            ))}
          </SortableContext>

          <DragOverlay
            dropAnimation={{
              duration: 200,
              easing: "cubic-bezier(0.18, 0.67, 0.6, 1.02)",
            }}
          >
            {activeCard ? (
              <div className="scale-[1.02] shadow-[0_12px_32px_rgba(10,31,63,0.15)] ring-2 ring-[var(--teal)]/40 rounded-xl transition-all duration-200 ease-out">
                <KanbanCard
                  card={activeCard}
                  directions={directions}
                  dirColors={DIR_COLORS}
                  onEdit={() => {}}
                  onDelete={() => {}}
                  onSetDirection={() => {}}
                  onOpenDesc={undefined}
                  isDragging
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {totalWithDir > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-[var(--navy)] border-t-2 border-[var(--teal)] py-2 px-6 z-[200]">
          <div className="max-w-[1900px] mx-auto flex items-center gap-4 flex-wrap">
            {directions.map((d, i) => (
              <div key={d} className="flex items-center gap-2">
                {i > 0 && <div className="w-px h-4 bg-[var(--g600)]" />}
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: DIR_COLORS[d.toLowerCase()] }}
                />
                <span className="font-display font-extrabold text-white">{directionCounts[d.toLowerCase()] || 0}</span>
                <span className="text-xs text-[var(--g400)] font-medium">{d}</span>
              </div>
            ))}
            <div className="w-px h-4 bg-[var(--g600)]" />
            <div className="flex items-center gap-2">
              <span className="font-display font-extrabold text-[var(--g400)]">{cards.length - totalWithDir}</span>
              <span className="text-xs text-[var(--g400)] font-medium">Pendentes</span>
            </div>
          </div>
        </div>
      )}

      <div className="fixed top-14 right-6 flex items-center gap-2 z-[200]">
        <label className="btn-secondary cursor-pointer inline-flex items-center justify-center gap-1.5 text-[var(--g600)] hover:text-[var(--g700)]">
          Importar
          <input
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleImportCSV}
          />
        </label>
        <button
          onClick={handleExportCSV}
          className="btn-secondary"
        >
          Exportar
        </button>
      </div>

      {modalCard && (
        <CardModal
          card={modalCard}
          mode={modalMode}
          buckets={buckets}
          priorities={priorities}
          progresses={progresses}
          filterLabels={filterLabels}
          onClose={() => setModalCard(null)}
          onSave={(updated) => {
            updateDb((prev) => {
              if (modalMode === "new") {
                return { ...prev, cards: [...prev.cards, { ...updated, order: prev.cards.filter((c) => c.bucket === updated.bucket).length }] };
              }
              return {
                ...prev,
                cards: prev.cards.map((c) => (c.id === updated.id ? updated : c)),
              };
            });
            setModalCard(null);
          }}
          onDelete={(id) => {
            updateDb((prev) => ({ ...prev, cards: prev.cards.filter((c) => c.id !== id) }));
            setModalCard(null);
          }}
        />
      )}

      {descModalCard && (
        <DescModal
          card={descModalCard}
          onClose={() => setDescModalCard(null)}
          onSave={(cardId, desc) => {
            updateDb((prev) => ({
              ...prev,
              cards: prev.cards.map((c) => (c.id === cardId ? { ...c, desc } : c)),
            }));
            setDescModalCard(null);
          }}
        />
      )}

      {mapaOpen && (
        <MapaModal
          mapaProducao={db.mapaProducao || []}
          onClose={() => setMapaOpen(false)}
          onSave={(arr) => updateDb((prev) => ({ ...prev, mapaProducao: arr }))}
        />
      )}

      {addColumnOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-[400] flex items-center justify-center"
          onClick={() => setAddColumnOpen(false)}
        >
          <div
            className="bg-white rounded-[var(--rad)] p-6 min-w-[280px] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display font-bold text-[var(--navy)] mb-4">Nova coluna</h3>
            <input
              type="text"
              value={newColumnName}
              onChange={(e) => setNewColumnName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addColumn()}
              placeholder="Ex: Backlog, Em progresso..."
              className="w-full px-3 py-2 border border-[var(--g200)] rounded-lg text-sm mb-4 focus:border-[var(--teal)] outline-none"
              autoFocus
            />
            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => { setAddColumnOpen(false); setNewColumnName(""); }}
                className="btn-secondary"
              >
                Cancelar
              </button>
              <button
                onClick={addColumn}
                className="btn-primary"
              >
                Criar
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/30 z-[400] flex items-center justify-center">
          <div className="bg-white rounded-[var(--rad)] p-6 min-w-[280px] text-center shadow-xl">
            <p className="text-[var(--g700)] mb-4 font-medium">
              {confirmDelete.type === "card"
                ? `Excluir "${cards.find((c) => c.id === confirmDelete.id)?.title}"?`
                : `Excluir a coluna "${confirmDelete.label}"?`}
            </p>
            <div className="flex gap-3 justify-center pt-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="btn-secondary"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (confirmDelete.type === "card") {
                    updateDb((prev) => ({
                      ...prev,
                      cards: prev.cards.filter((c) => c.id !== confirmDelete.id),
                    }));
                  } else {
                    deleteColumn(confirmDelete.id);
                  }
                  setConfirmDelete(null);
                }}
                className="btn-danger-solid"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
