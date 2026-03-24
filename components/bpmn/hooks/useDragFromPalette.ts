"use client";

import { useCallback, type DragEvent } from "react";
import { useReactFlow } from "@xyflow/react";
import { useBpmnStore, uid, laneForY, snap, type BpmnFlowNode, type BpmnNodeData } from "@/stores/bpmn-store";
import type { BpmnNodeType, BpmnSemanticVariant } from "@/lib/bpmn-types";

/**
 * Handles the drop event when a stencil item from the palette
 * is dropped onto the React Flow canvas.
 */
export function useDragFromPalette() {
  const rf = useReactFlow();
  const { addNode, addLaneAt, lanes } = useBpmnStore();

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();

      const bpmnType = e.dataTransfer.getData("application/x-bpmn-type");
      if (!bpmnType) return;

      const position = rf.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });

      if (bpmnType === "swim_lane") {
        addLaneAt(position.x, position.y);
        return;
      }

      const width = Number(e.dataTransfer.getData("application/x-bpmn-width")) || 160;
      const height = Number(e.dataTransfer.getData("application/x-bpmn-height")) || 60;
      const variant = e.dataTransfer.getData("application/x-bpmn-variant") as BpmnSemanticVariant | "";

      const x = snap(Math.max(60, position.x));
      const y = snap(Math.max(8, position.y));
      const laneId = laneForY(y, lanes);

      const newNode: BpmnFlowNode = {
        id: uid(bpmnType.replace(/[^a-z_]/g, "")),
        type: bpmnType,
        position: { x, y },
        data: {
          bpmnType: bpmnType as BpmnNodeType,
          label: bpmnType.replace(/_/g, " "),
          laneId,
          ...(variant ? { semanticVariant: variant } : {}),
        } satisfies BpmnNodeData,
        style: { width, height },
      };

      addNode(newNode);
    },
    [rf, addNode, addLaneAt, lanes],
  );

  return { onDragOver, onDrop };
}
