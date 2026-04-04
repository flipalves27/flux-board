"use client";

import { useEffect } from "react";
import { useBpmnStore } from "@/stores/bpmn-store";

const GRID_SIZE = 20;

/**
 * Global keyboard shortcuts for the BPMN workspace.
 * Binds Delete, Ctrl+Z/Y/C/V/D, arrows, S (snap toggle), etc.
 */
export function useBpmnKeyboard() {
  const {
    selectedNodeIds,
    selectedEdgeId,
    removeNodes,
    removeEdge,
    duplicateNodes,
    undo,
    redo,
    snapEnabled,
    setSnapEnabled,
    nodes,
    setNodes,
    syncCode,
    pushHistory,
    updateNodeData,
  } = useBpmnStore();

  useEffect(() => {
    function onKeyDown(ev: KeyboardEvent) {
      const target = ev.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

      const ctrl = ev.ctrlKey || ev.metaKey;

      // Delete / Backspace
      if (ev.key === "Delete" || ev.key === "Backspace") {
        if (selectedNodeIds.length > 0) {
          ev.preventDefault();
          removeNodes(selectedNodeIds);
          return;
        }
        if (selectedEdgeId) {
          ev.preventDefault();
          removeEdge(selectedEdgeId);
          return;
        }
      }

      // Undo
      if (ctrl && ev.key.toLowerCase() === "z" && !ev.shiftKey) {
        ev.preventDefault();
        undo();
        return;
      }

      // Redo (Ctrl+Shift+Z or Ctrl+Y)
      if ((ctrl && ev.key.toLowerCase() === "z" && ev.shiftKey) || (ctrl && ev.key.toLowerCase() === "y")) {
        ev.preventDefault();
        redo();
        return;
      }

      // Duplicate (Ctrl+D)
      if (ctrl && ev.key.toLowerCase() === "d") {
        if (selectedNodeIds.length > 0) {
          ev.preventDefault();
          duplicateNodes(selectedNodeIds);
        }
        return;
      }

      // Arrow keys — nudge
      if (!ctrl && !ev.altKey && ev.key.startsWith("Arrow")) {
        if (selectedNodeIds.length === 0) return;
        ev.preventDefault();
        const dist = ev.shiftKey ? GRID_SIZE * 2 : GRID_SIZE;
        const dx = ev.key === "ArrowRight" ? dist : ev.key === "ArrowLeft" ? -dist : 0;
        const dy = ev.key === "ArrowDown" ? dist : ev.key === "ArrowUp" ? -dist : 0;
        if (!dx && !dy) return;

        const ids = new Set(selectedNodeIds);
        const updated = nodes.map((n) => {
          if (!ids.has(n.id)) return n;
          return {
            ...n,
            position: {
              x: Math.max(60, Math.round((n.position.x + dx) / GRID_SIZE) * GRID_SIZE),
              y: Math.max(8, Math.round((n.position.y + dy) / GRID_SIZE) * GRID_SIZE),
            },
          };
        });
        setNodes(updated);
        pushHistory();
        syncCode();
        return;
      }

      // Toggle snap
      if (!ctrl && !ev.altKey && !ev.shiftKey && ev.key.toLowerCase() === "s") {
        ev.preventDefault();
        setSnapEnabled(!snapEnabled);
        return;
      }

      // Font size shortcuts
      if (!ctrl && !ev.altKey && (ev.key === "[" || ev.key === "]")) {
        const nodeId = selectedNodeIds[0];
        if (!nodeId) return;
        ev.preventDefault();
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) return;
        const current = node.data.fontSize ?? 13;
        const next = ev.key === "[" ? Math.max(8, current - 1) : Math.min(32, current + 1);
        updateNodeData(nodeId, { fontSize: next });
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedNodeIds, selectedEdgeId, removeNodes, removeEdge, duplicateNodes, undo, redo, snapEnabled, setSnapEnabled, nodes, setNodes, syncCode, pushHistory, updateNodeData]);
}
