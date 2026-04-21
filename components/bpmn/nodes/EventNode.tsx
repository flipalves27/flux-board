"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { BpmnNodeData } from "@/stores/bpmn-store";

const EV_PALETTE: Record<string, { bg: string; border: string; fg: string; glyph: string; thick?: boolean }> = {
  start_event: {
    bg: "var(--flux-bpmn-event-start-bg)",
    border: "var(--flux-bpmn-event-start-border)",
    fg: "var(--flux-bpmn-event-start-fg)",
    glyph: "▶",
  },
  end_event: {
    bg: "var(--flux-bpmn-event-end-bg)",
    border: "var(--flux-bpmn-event-end-border)",
    fg: "var(--flux-bpmn-event-end-fg)",
    glyph: "⬛",
    thick: true,
  },
  message_event: {
    bg: "var(--flux-bpmn-event-message-bg)",
    border: "var(--flux-bpmn-event-message-border)",
    fg: "var(--flux-bpmn-event-message-fg)",
    glyph: "✉",
  },
  timer_event: {
    bg: "var(--flux-bpmn-event-timer-bg)",
    border: "var(--flux-bpmn-event-timer-border)",
    fg: "var(--flux-bpmn-event-timer-fg)",
    glyph: "⏱",
  },
  intermediate_event: {
    bg: "var(--flux-bpmn-event-intermediate-bg)",
    border: "var(--flux-bpmn-event-intermediate-border)",
    fg: "var(--flux-bpmn-event-intermediate-fg)",
    glyph: "◎",
  },
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
          boxShadow: selected ? "var(--flux-bpmn-event-selected-glow)" : "0 3px 12px var(--flux-bpmn-task-shadow-soft)",
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
