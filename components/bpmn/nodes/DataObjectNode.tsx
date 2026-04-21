"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { BpmnNodeData } from "@/stores/bpmn-store";

function DataObjectNodeInner({ data, selected }: NodeProps & { data: BpmnNodeData }) {
  return (
    <>
      <div
        className="flex h-full flex-col items-center justify-center gap-1 px-3 py-2"
        style={{
          background: data.bgColor ?? "var(--flux-surface-card)",
          border: `1px solid ${data.borderColor ?? "var(--flux-border-subtle)"}`,
          borderRadius: 4,
          boxShadow: selected ? "var(--flux-bpmn-data-shadow-selected)" : "var(--flux-bpmn-data-shadow)",
          transition: "box-shadow 150ms ease",
        }}
      >
        <svg width="20" height="24" viewBox="0 0 20 24" fill="none" className="shrink-0" aria-hidden>
          <path
            d="M0 2C0 0.9 0.9 0 2 0H13L20 7V22C20 23.1 19.1 24 18 24H2C0.9 24 0 23.1 0 22V2Z"
            fill="var(--flux-surface-elevated)"
            stroke="var(--flux-bpmn-semantic-artifact)"
            strokeWidth="1.2"
          />
          <path d="M13 0V5C13 6.1 13.9 7 15 7H20" fill="none" stroke="var(--flux-bpmn-semantic-artifact)" strokeWidth="1.2" />
        </svg>
        <span
          className="text-center font-bold leading-tight"
          style={{
            fontSize: data.fontSize ?? 10,
            color: data.labelColor ?? "var(--flux-text)",
          }}
        >
          {data.label || "Documento"}
        </span>
      </div>

      <Handle type="target" position={Position.Left} id="west" className="bpmn-handle" />
      <Handle type="target" position={Position.Top} id="north" className="bpmn-handle" />
      <Handle type="source" position={Position.Right} id="east" className="bpmn-handle" />
      <Handle type="source" position={Position.Bottom} id="south" className="bpmn-handle" />
    </>
  );
}

export const DataObjectNode = memo(DataObjectNodeInner);
