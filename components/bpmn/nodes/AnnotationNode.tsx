"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { BpmnNodeData } from "@/stores/bpmn-store";

function AnnotationNodeInner({ data, selected }: NodeProps & { data: BpmnNodeData }) {
  return (
    <>
      <div
        className="flex h-full flex-col justify-center px-3 py-2"
        style={{
          background: data.bgColor ?? "var(--flux-bpmn-annotation-bg)",
          borderLeft: `4px solid ${data.borderColor ?? "var(--flux-bpmn-semantic-gateway)"}`,
          borderRadius: "0 10px 10px 0",
          maxWidth: 190,
          boxShadow: selected ? "var(--flux-bpmn-data-shadow-selected)" : "var(--flux-bpmn-gateway-shadow)",
          transition: "box-shadow 150ms ease",
        }}
      >
        <span
          className="font-semibold leading-snug"
          style={{
            fontSize: data.fontSize ?? 10,
            color: data.labelColor ?? "var(--flux-text)",
            lineHeight: 1.4,
          }}
        >
          {data.label || "Anotação"}
        </span>
        {data.subtitle && (
          <span className="mt-0.5 text-[10px] text-[var(--flux-text-muted)]">{data.subtitle}</span>
        )}
      </div>

      <Handle type="target" position={Position.Left} id="west" className="bpmn-handle" />
      <Handle type="source" position={Position.Right} id="east" className="bpmn-handle" />
    </>
  );
}

export const AnnotationNode = memo(AnnotationNodeInner);
