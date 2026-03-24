"use client";

import { memo, useCallback, useRef, useState } from "react";
import { type NodeProps, NodeResizer, useReactFlow } from "@xyflow/react";
import type { BpmnNodeData } from "@/stores/bpmn-store";
import { useBpmnStore, LANE_GRADIENTS } from "@/stores/bpmn-store";

const MIN_WIDTH = 400;
const MIN_HEIGHT = 100;
const MAX_HEIGHT = 800;

function SwimLaneNodeInner(props: NodeProps) {
  const { id, data: rawData, selected } = props;
  const data = rawData as BpmnNodeData;

  const rf = useReactFlow();
  const { removeLane, updateLane } = useBpmnStore();

  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState("");
  const [isTagEditing, setIsTagEditing] = useState(false);
  const [editTag, setEditTag] = useState("");
  const [showColorPicker, setShowColorPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const laneModelId = data.laneModelId ?? "";
  const gradFrom = data.gradientFrom ?? "#00695C";
  const gradTo = data.gradientTo ?? "#00897B";
  const gradient = `linear-gradient(180deg, ${gradFrom}, ${gradTo})`;

  const onStartEdit = useCallback(() => {
    setEditLabel(data.label);
    setIsEditing(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [data.label]);

  const onFinishEdit = useCallback(() => {
    const trimmed = editLabel.trim();
    if (trimmed && trimmed !== data.label && laneModelId) {
      updateLane(laneModelId, { label: trimmed });
    }
    setIsEditing(false);
  }, [editLabel, data.label, laneModelId, updateLane]);

  const onStartTagEdit = useCallback(() => {
    setEditTag(data.laneTag ?? "");
    setIsTagEditing(true);
  }, [data.laneTag]);

  const onFinishTagEdit = useCallback(() => {
    if (laneModelId) {
      updateLane(laneModelId, { tag: editTag.trim() || undefined });
    }
    setIsTagEditing(false);
  }, [editTag, laneModelId, updateLane]);

  const onDelete = useCallback(() => {
    if (laneModelId) removeLane(laneModelId);
  }, [laneModelId, removeLane]);

  const onColorSelect = useCallback(
    (grad: [string, string]) => {
      if (laneModelId) {
        updateLane(laneModelId, { gradient: grad });
      }
      setShowColorPicker(false);
    },
    [laneModelId, updateLane],
  );

  const handleResize = useCallback(() => {
    requestAnimationFrame(() => {
      const node = rf.getNode(id);
      if (!node || !laneModelId) return;
      const h = (node.style?.height as number | undefined) ?? 160;
      updateLane(laneModelId, { y: node.position.y, height: h });
    });
  }, [rf, id, laneModelId, updateLane]);

  return (
    <>
      <NodeResizer
        minWidth={MIN_WIDTH}
        minHeight={MIN_HEIGHT}
        maxHeight={MAX_HEIGHT}
        isVisible={!!selected}
        lineClassName="bpmn-lane-resize-line"
        handleClassName="bpmn-lane-resize-handle"
        onResizeEnd={handleResize}
      />

      <div className="bpmn-swim-lane-body flex h-full w-full" data-selected={selected ? "true" : undefined}>
        {/* Vertical gradient label bar */}
        <div
          className="bpmn-swim-lane-bar relative flex h-full w-[52px] shrink-0 select-none items-center justify-center rounded-l-md"
          style={{ background: gradient }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onStartEdit();
          }}
        >
          {isEditing ? (
            <input
              ref={inputRef}
              autoFocus
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onFinishEdit();
                else if (e.key === "Escape") setIsEditing(false);
              }}
              onBlur={onFinishEdit}
              onClick={(e) => e.stopPropagation()}
              className="bpmn-swim-lane-label-input"
            />
          ) : (
            <span className="bpmn-swim-lane-label-text">{data.label}</span>
          )}
        </div>

        {/* Lane body area */}
        <div className="relative min-w-0 flex-1">
          {/* Tag pill */}
          {isTagEditing ? (
            <input
              autoFocus
              value={editTag}
              onChange={(e) => setEditTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onFinishTagEdit();
                else if (e.key === "Escape") setIsTagEditing(false);
              }}
              onBlur={onFinishTagEdit}
              onClick={(e) => e.stopPropagation()}
              className="absolute left-3 top-2.5 z-10 max-w-[280px] rounded px-2 py-0.5 text-[12px] font-bold text-[#1A2744] shadow-sm outline-none ring-2 ring-[var(--flux-primary)]/40"
              style={{ background: "rgba(255,255,255,0.95)" }}
              placeholder="Tag da raia (ex: AS-IS — Área)"
            />
          ) : data.laneTag ? (
            <span
              className="absolute left-3 top-2.5 z-10 max-w-[min(360px,65%)] cursor-pointer truncate rounded px-2.5 py-0.5 text-[12px] font-bold text-[#1A2744] transition hover:ring-2 hover:ring-[var(--flux-primary)]/30"
              style={{
                background: "rgba(255,255,255,0.92)",
                boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                letterSpacing: "0.5px",
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onStartTagEdit();
              }}
            >
              {data.laneTag}
            </span>
          ) : selected ? (
            <button
              type="button"
              className="absolute left-3 top-2.5 z-10 rounded px-2 py-0.5 text-[11px] font-semibold text-[var(--flux-text-muted)] opacity-50 transition hover:opacity-90 hover:ring-1 hover:ring-[var(--flux-primary)]/30"
              style={{ background: "rgba(255,255,255,0.7)" }}
              onClick={(e) => {
                e.stopPropagation();
                onStartTagEdit();
              }}
            >
              + tag
            </button>
          ) : null}

          {/* Toolbar: shown when selected */}
          {selected && (
            <div className="bpmn-swim-lane-toolbar">
              <button
                type="button"
                title="Editar nome"
                className="bpmn-lane-tool-btn"
                onClick={(e) => { e.stopPropagation(); onStartEdit(); }}
              >
                ✎
              </button>
              <button
                type="button"
                title="Cores"
                className="bpmn-lane-tool-btn"
                onClick={(e) => { e.stopPropagation(); setShowColorPicker(!showColorPicker); }}
              >
                🎨
              </button>
              <button
                type="button"
                title="Excluir swim lane"
                className="bpmn-lane-tool-btn bpmn-lane-tool-btn-danger"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
              >
                🗑
              </button>
            </div>
          )}

          {/* Color picker popup */}
          {showColorPicker && (
            <div
              className="absolute right-2 top-10 z-50 flex flex-wrap gap-1.5 rounded-lg border border-[var(--flux-border-default)] bg-[var(--flux-surface-card)] p-2 shadow-xl"
              style={{ maxWidth: 180 }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="w-full text-[10px] font-bold uppercase tracking-wide text-[var(--flux-text-muted)]">Gradiente</p>
              {LANE_GRADIENTS.map((g, i) => (
                <button
                  key={i}
                  type="button"
                  className="h-7 w-7 rounded-full border-2 transition hover:scale-110"
                  style={{
                    background: `linear-gradient(180deg, ${g[0]}, ${g[1]})`,
                    borderColor: gradFrom === g[0] && gradTo === g[1] ? "white" : "transparent",
                    boxShadow: gradFrom === g[0] && gradTo === g[1] ? "0 0 0 2px var(--flux-primary)" : "0 1px 4px rgba(0,0,0,0.15)",
                  }}
                  onClick={() => onColorSelect(g)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export const SwimLaneNode = memo(SwimLaneNodeInner);
