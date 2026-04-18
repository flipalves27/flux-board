"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { BpmnNodeData } from "@/stores/bpmn-store";
import { BPMN_TASK_VARIANT_STYLES, resolveBpmnTaskVariant } from "@/lib/bpmn-flow-tokens";

function TaskNodeInner({ data, selected }: NodeProps & { data: BpmnNodeData }) {
  const variant = resolveBpmnTaskVariant(data.semanticVariant as string | undefined);
  const vs = BPMN_TASK_VARIANT_STYLES[variant];

  return (
    <>
      {/* Background card */}
      <div
        className="bpmn-task-card pointer-events-none absolute inset-0"
        style={{
          borderLeft: `5px ${vs.borderStyle} ${data.borderColor ?? vs.accent}`,
          backgroundColor: data.bgColor ?? vs.bg,
          borderTop: "1px solid var(--flux-bpmn-task-hairline)",
          borderRight: "1px solid var(--flux-bpmn-task-hairline)",
          borderBottom: "1px solid var(--flux-bpmn-task-hairline)",
          borderRadius: "0 10px 10px 0",
          borderTopLeftRadius: 10,
          borderBottomLeftRadius: 10,
          boxShadow: selected ? "0 4px 16px var(--flux-bpmn-task-shadow-selected)" : "0 3px 12px var(--flux-bpmn-task-shadow-soft)",
        }}
      />

      {/* Step number badge */}
      {data.stepNumber && (
        <span
          className="pointer-events-none absolute left-2 top-1.5 z-[2] flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1 text-[10px] font-extrabold text-white"
          style={{ background: vs.badgeBg }}
        >
          {data.stepNumber}
        </span>
      )}

      {/* Pain badge */}
      {data.painBadge && (
        <span
          className="pointer-events-none absolute z-[3] flex items-center justify-center rounded-full border-2 border-white font-extrabold text-white"
          style={{
            top: -10,
            right: -10,
            width: 26,
            height: 26,
            fontSize: 12,
            background: "var(--flux-bpmn-pain-red)",
            boxShadow: "0 2px 8px var(--flux-bpmn-pain-glow)",
          }}
        >
          {data.painBadge}
        </span>
      )}

      {/* Label */}
      <div className="relative z-[1] flex h-full flex-col items-center justify-center px-3 py-2">
        <span
          className="block text-center font-bold leading-snug"
          style={{
            fontSize: data.fontSize ?? 13,
            color: data.labelColor ?? "var(--flux-text)",
          }}
        >
          {data.label}
        </span>
        {data.subtitle && (
          <span className="mt-0.5 block text-center text-[10px] font-medium leading-tight text-[var(--flux-text-muted)]">
            {data.subtitle}
          </span>
        )}
      </div>

      {/* Handles (ports) */}
      <Handle type="target" position={Position.Left} id="west" className="bpmn-handle" />
      <Handle type="target" position={Position.Top} id="north" className="bpmn-handle" />
      <Handle type="source" position={Position.Right} id="east" className="bpmn-handle" />
      <Handle type="source" position={Position.Bottom} id="south" className="bpmn-handle" />
    </>
  );
}

export const TaskNode = memo(TaskNodeInner);
