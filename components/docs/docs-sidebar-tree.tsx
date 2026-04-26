"use client";

import { useCallback, type ReactNode } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDroppable,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { DocTreeNode } from "@/lib/docs-types";
import { getDescendantIdsFromDocTree } from "@/lib/docs-types";
import { useNavigationVariant } from "@/context/navigation-variant-context";
import { useTranslations } from "next-intl";

const ROOT_DROP_ID = "doc-drop-__root__";
const dragId = (docId: string) => `doc-drag-${docId}`;
const dropId = (docId: string) => `doc-drop-${docId}`;

type Props = {
  docs: DocTreeNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: (parentId: string | null) => void;
  onReparent: (docId: string, newParentId: string | null) => void | Promise<void>;
  /** Admins: multi-select + batch delete (drag-and-drop is disabled while active). */
  isAdmin?: boolean;
  bulkMode?: boolean;
  onBulkModeChange?: (next: boolean) => void;
  selectedBulkIds?: Set<string>;
  onToggleBulk?: (id: string) => void;
  onBulkDelete?: () => void;
};

function DragHandle({ id }: { id: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: dragId(id) });
  const style = { transform: CSS.Transform.toString(transform), opacity: isDragging ? 0.45 : 1, touchAction: "none" as const };
  return (
    <button
      type="button"
      ref={setNodeRef}
      className="mt-0.5 shrink-0 cursor-grab rounded p-0.5 text-[var(--flux-text-muted)] hover:text-[var(--flux-primary-light)]"
      style={style}
      aria-label="Drag to reparent"
      data-skip-command-palette
      {...listeners}
      {...attributes}
    >
      <span className="text-[10px] leading-none">⋮⋮</span>
    </button>
  );
}

function DroppableRow({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  const { isOver, setNodeRef } = useDroppable({ id: dropId(id) });
  return (
    <div
      ref={setNodeRef}
      className={`${className ?? ""} ${isOver ? "relative rounded-md ring-1 ring-[var(--flux-primary-alpha-35)]" : ""}`.trim()}
    >
      {children}
    </div>
  );
}

function DocTreeBranch({
  doc,
  depth,
  selectedId,
  onSelect,
  onCreate,
  isMinimal,
  bulkMode,
  selectedBulkIds,
  onToggleBulk,
}: {
  doc: DocTreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: (parentId: string | null) => void;
  isMinimal: boolean;
  bulkMode: boolean;
  selectedBulkIds: Set<string>;
  onToggleBulk: (id: string) => void;
}) {
  const t = useTranslations("docsPage.sidebar");
  const isRoot = depth === 0;

  const btnClass = isRoot
    ? isMinimal
      ? `border-y-0 border-r-0 border-l-2 pl-3 pr-2.5 py-2 rounded-r-lg ${
          selectedId === doc.id
            ? "border-l-[var(--flux-primary-light)] bg-[var(--flux-primary-alpha-08)] text-[var(--flux-text)]"
            : "border-l-transparent text-[var(--flux-text)] hover:bg-[var(--flux-chrome-alpha-06)]"
        }`
      : `rounded-lg border px-2.5 py-2 ${
          selectedId === doc.id
            ? "border-[var(--flux-primary-alpha-25)] bg-[linear-gradient(135deg,var(--flux-primary-alpha-20),var(--flux-primary-alpha-10))] text-[var(--flux-primary-light)] shadow-[0_6px_20px_var(--flux-primary-alpha-12)]"
            : "border-transparent text-[var(--flux-text)] hover:border-[var(--flux-primary-alpha-12)] hover:bg-[var(--flux-chrome-alpha-06)]"
        }`
    : isMinimal
      ? `border-y-0 border-r-0 border-l-2 pl-2 py-1.5 rounded-r-md ${
          selectedId === doc.id
            ? "border-l-[var(--flux-primary-light)] bg-[var(--flux-primary-alpha-08)] text-[var(--flux-text)]"
            : "border-l-transparent text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-06)]"
        }`
      : `rounded-md border px-2 py-1.5 ${
          selectedId === doc.id
            ? "border-[var(--flux-primary-alpha-25)] bg-[var(--flux-primary-alpha-18)] text-[var(--flux-primary-light)]"
            : "border-transparent text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-10)] hover:bg-[var(--flux-chrome-alpha-06)]"
        }`;

  const textSize = isRoot ? "text-sm font-medium" : "text-xs";
  const inBulk = bulkMode && selectedBulkIds.has(doc.id);
  const btnWithBulk = inBulk
    ? `${btnClass} ring-1 ring-[var(--flux-primary)] ring-offset-1 ring-offset-[var(--flux-surface-mid)]`
    : btnClass;

  return (
    <DroppableRow id={doc.id}>
      <div className={depth > 0 ? "mt-1" : ""}>
        <div className="flex items-start gap-0.5">
          {bulkMode ? (
            <input
              type="checkbox"
              className="mt-1.5 h-3.5 w-3.5 shrink-0 accent-[var(--flux-primary)]"
              checked={selectedBulkIds.has(doc.id)}
              onChange={() => onToggleBulk(doc.id)}
              onClick={(e) => e.stopPropagation()}
              aria-label={t("selectDoc")}
            />
          ) : (
            <DragHandle id={doc.id} />
          )}
          <button
            type="button"
            className={`min-w-0 flex-1 text-left transition-all duration-200 ${btnWithBulk} ${textSize}`}
            onClick={() => (bulkMode ? onToggleBulk(doc.id) : onSelect(doc.id))}
          >
            {doc.title}
          </button>
        </div>
        {doc.children.length > 0 ? (
          <div
            className={`ml-3 mt-1 space-y-1 border-l pl-2 ${
              isMinimal ? "border-[var(--flux-chrome-alpha-10)]" : "border-[var(--flux-primary-alpha-10)]"
            }`}
          >
            {doc.children.map((child) => (
              <DocTreeBranch
                key={child.id}
                doc={child}
                depth={depth + 1}
                selectedId={selectedId}
                onSelect={onSelect}
                onCreate={onCreate}
                isMinimal={isMinimal}
                bulkMode={bulkMode}
                selectedBulkIds={selectedBulkIds}
                onToggleBulk={onToggleBulk}
              />
            ))}
          </div>
        ) : null}
        {!bulkMode ? (
          <button
            type="button"
            className="ml-3 mt-1 block w-full text-left text-[10px] text-[var(--flux-text-muted)] hover:text-[var(--flux-primary-light)]"
            onClick={() => onCreate(doc.id)}
          >
            {t("subdoc")}
          </button>
        ) : null}
      </div>
    </DroppableRow>
  );
}

function RootDroppable() {
  const t = useTranslations("docsPage.sidebar");
  const { isOver, setNodeRef } = useDroppable({ id: ROOT_DROP_ID });
  return (
    <div
      ref={setNodeRef}
      className={`mb-2 rounded-md border border-dashed px-2 py-1.5 text-center text-[10px] ${
        isOver ? "border-[var(--flux-primary)] bg-[var(--flux-primary-alpha-08)] text-[var(--flux-text)]" : "border-[var(--flux-chrome-alpha-10)] text-[var(--flux-text-muted)]"
      }`}
    >
      {t("dndRoot")}
    </div>
  );
}

export function DocsSidebarTree({
  docs,
  selectedId,
  onSelect,
  onCreate,
  onReparent,
  isAdmin = false,
  bulkMode = false,
  onBulkModeChange,
  selectedBulkIds = new Set(),
  onToggleBulk,
  onBulkDelete,
}: Props) {
  const t = useTranslations("docsPage.sidebar");
  const navVariant = useNavigationVariant();
  const isMinimal = navVariant === "minimal";
  const showBulk = Boolean(isAdmin);
  const bulk = Boolean(bulkMode) && showBulk;
  const toggle = onToggleBulk ?? (() => {});
  const nBulk = selectedBulkIds.size;
  const isInvalid = useCallback((docsTree: DocTreeNode[], dId: string, targetParent: string | null) => {
    if (!targetParent) return false;
    if (targetParent === dId) return true;
    return getDescendantIdsFromDocTree(docsTree, dId).includes(targetParent);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;
      const a = String(active.id);
      const o = String(over.id);
      if (!a.startsWith("doc-drag-")) return;
      const dragIdStr = a.slice("doc-drag-".length);
      let newParent: string | null = null;
      if (o === ROOT_DROP_ID) {
        newParent = null;
      } else if (o.startsWith("doc-drop-")) {
        newParent = o.slice("doc-drop-".length);
      } else {
        return;
      }
      if (newParent === dragIdStr) return;
      if (isInvalid(docs, dragIdStr, newParent)) return;
      void onReparent(dragIdStr, newParent);
    },
    [docs, isInvalid, onReparent]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  return (
    <aside
      className={`w-[300px] shrink-0 border-r p-3 ${
        isMinimal
          ? "border-[var(--flux-chrome-alpha-10)] bg-[var(--flux-surface-mid)]"
          : "border-[var(--flux-primary-alpha-10)] bg-[linear-gradient(180deg,var(--flux-surface-mid),color-mix(in_srgb,var(--flux-surface-mid)_90%,var(--flux-primary)_10%))]"
      }`}
    >
      <div className="mb-3 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[var(--flux-text-muted)]">{t("label")}</div>
          <div className="flex shrink-0 items-center gap-1">
            {showBulk && (
              <>
                {bulk ? (
                  <>
                    <button
                      type="button"
                      className="rounded border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-1.5 py-0.5 text-[10px] text-[var(--flux-text)] enabled:hover:border-red-500/50 disabled:opacity-40"
                      onClick={() => onBulkDelete?.()}
                      disabled={!nBulk}
                    >
                      {t("bulkDelete", { n: nBulk })}
                    </button>
                    <button
                      type="button"
                      className="text-[10px] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
                      onClick={() => onBulkModeChange?.(false)}
                    >
                      {t("bulkCancel")}
                    </button>
                  </>
                ) : (
                  <button type="button" className="text-[10px] text-[var(--flux-text-muted)] hover:text-[var(--flux-primary-light)]" onClick={() => onBulkModeChange?.(true)}>
                    {t("bulkMode")}
                  </button>
                )}
              </>
            )}
            <button type="button" className="btn-primary px-2 py-1 text-xs" onClick={() => onCreate(null)}>
              {t("new")}
            </button>
          </div>
        </div>
        <p className="text-[10px] text-[var(--flux-text-muted)]">{bulk ? t("bulkHint") : t("dndHint")}</p>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={bulk ? () => {} : handleDragEnd}>
        {!bulk ? <RootDroppable /> : <div className="mb-2 h-0" aria-hidden />}
        <div className="space-y-1.5">
          {docs.map((doc) => (
            <DocTreeBranch
              key={doc.id}
              doc={doc}
              depth={0}
              selectedId={selectedId}
              onSelect={onSelect}
              onCreate={onCreate}
              isMinimal={isMinimal}
              bulkMode={bulk}
              selectedBulkIds={selectedBulkIds}
              onToggleBulk={toggle}
            />
          ))}
        </div>
      </DndContext>
    </aside>
  );
}
