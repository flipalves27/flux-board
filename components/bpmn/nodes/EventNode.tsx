"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { BpmnNodeData } from "@/stores/bpmn-store";

const EV_PALETTE: Record<string, { bg: string; border: string; fg: string; glyph: string; thick?: boolean }> = {
  start_event: { bg: "#C8E6C9", border: "#43A047", fg: "#2E7D32", glyph: "▶" },
  end_event: { bg: "#C8E6C9", border: "#2E7D32", fg: "#2E7D32", glyph: "⬛", thick: true },
  message_event: { bg: "#BBDEFB", border: "#1E88E5", fg: "#1565C0", glyph: "✉" },
  timer_event: { bg: "#E1F5FE", border: "#039BE5", fg: "#0277BD", glyph: "⏱" },
  intermediate_event: { bg: "#FFF9C4", border: "#F9A825", fg: "#F57F17", glyph: "◎" },
};

function EventNodeInner({ data, selected }: NodeProps & { data: BpmnNodeData }) {
  const palette = EV_PALETTE[data.bpmnType] ?? EV_PALETTE.intermediate_event;
  const size = 42;
  const isEnd = data.bpmnType === "end_event";

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="flex items-center justify-center rounded-full font-extrabold"
        style={{
          width: size,
          height: size,
          background: data.bgColor ?? palette.bg,
          border: `${isEnd ? 4 : 3}px solid ${data.borderColor ?? palette.border}`,
          color: palette.fg,
          fontSize: size * 0.36,
          boxShadow: selected
            ? "0 0 0 3px rgba(108,92,231,0.35), 0 3px 12px rgba(26,39,68,0.1)"
            : "0 3px 12px rgba(26,39,68,0.1)",
          transition: "box-shadow 150ms ease, transform 150ms cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        {palette.glyph}
      </div>
      <span
        className="max-w-[100px] text-center font-bold leading-tight"
        style={{
          fontSize: data.fontSize ?? 11,
          color: data.labelColor ?? "var(--flux-text)",
        }}
      >
        {data.label}
      </span>

      {data.bpmnType === "start_event" ? (
        <>
          <Handle type="source" position={Position.Right} id="east" className="bpmn-handle" />
          <Handle type="source" position={Position.Bottom} id="south" className="bpmn-handle" />
        </>
      ) : data.bpmnType === "end_event" ? (
        <>
          <Handle type="target" position={Position.Left} id="west" className="bpmn-handle" />
          <Handle type="target" position={Position.Top} id="north" className="bpmn-handle" />
        </>
      ) : (
        <>
          <Handle type="target" position={Position.Left} id="west" className="bpmn-handle" />
          <Handle type="target" position={Position.Top} id="north" className="bpmn-handle" />
          <Handle type="source" position={Position.Right} id="east" className="bpmn-handle" />
          <Handle type="source" position={Position.Bottom} id="south" className="bpmn-handle" />
        </>
      )}
    </div>
  );
}

export const EventNode = memo(EventNodeInner);
