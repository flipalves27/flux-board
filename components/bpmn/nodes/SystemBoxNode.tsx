"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { BpmnNodeData } from "@/stores/bpmn-store";

function SystemBoxNodeInner({ data, selected }: NodeProps & { data: BpmnNodeData }) {
  return (
    <>
      <div
        className="flex h-full flex-col items-center justify-center gap-1 px-3 py-2"
        style={{
          background: data.bgColor ?? "var(--flux-surface-elevated)",
          border: `2px dashed ${data.borderColor ?? "#5C6BC0"}`,
          borderRadius: 10,
          boxShadow: selected
            ? "0 0 0 2px rgba(108,92,231,0.35), 0 3px 12px rgba(26,39,68,0.1)"
            : "0 3px 12px rgba(26,39,68,0.1)",
          transition: "box-shadow 150ms ease",
        }}
      >
        <span className="text-[14px]">⚙</span>
        <span
          className="text-center font-bold leading-tight"
          style={{
            fontSize: data.fontSize ?? 12,
            color: data.labelColor ?? "var(--flux-primary-light)",
          }}
        >
          {data.label || "Sistema"}
        </span>
        {data.subtitle && (
          <span className="text-center text-[10px] text-[var(--flux-text-muted)]">{data.subtitle}</span>
        )}
      </div>

      <Handle type="target" position={Position.Left} id="west" className="bpmn-handle" />
      <Handle type="target" position={Position.Top} id="north" className="bpmn-handle" />
      <Handle type="source" position={Position.Right} id="east" className="bpmn-handle" />
      <Handle type="source" position={Position.Bottom} id="south" className="bpmn-handle" />
    </>
  );
}

export const SystemBoxNode = memo(SystemBoxNodeInner);
