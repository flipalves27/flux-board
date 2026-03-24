"use client";

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import type { BpmnNodeData } from "@/stores/bpmn-store";

/**
 * SwimLaneNode is rendered as a React Flow group node.
 * It acts as a visual container only; child nodes are assigned via parentId.
 * In our architecture, lanes are rendered separately in the workspace layer
 * (not as React Flow nodes), so this serves as a fallback / future expansion.
 */
function SwimLaneNodeInner({ data }: NodeProps & { data: BpmnNodeData }) {
  return (
    <div
      className="pointer-events-none flex h-full w-full items-start"
      style={{
        borderRadius: 6,
        border: "2px solid rgba(0,137,123,0.15)",
        background: "rgba(0,137,123,0.04)",
      }}
    >
      <div
        className="flex h-full w-[52px] items-center justify-center rounded-l-md text-[14px] font-extrabold uppercase text-white"
        style={{
          background: "linear-gradient(180deg, #00695C, #00897B)",
          writingMode: "vertical-rl",
          transform: "rotate(180deg)",
          letterSpacing: "2px",
        }}
      >
        {data.label}
      </div>
    </div>
  );
}

export const SwimLaneNode = memo(SwimLaneNodeInner);
