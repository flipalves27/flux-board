"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { BpmnNodeData } from "@/stores/bpmn-store";

const GATEWAY_GLYPH: Record<string, string> = {
  exclusive_gateway: "✕",
  parallel_gateway: "+",
  inclusive_gateway: "○",
};

function GatewayNodeInner({ data, selected }: NodeProps & { data: BpmnNodeData }) {
  const glyph = GATEWAY_GLYPH[data.bpmnType] ?? "✕";
  const diamondSize = 40;

  return (
    <div className="flex flex-col items-center gap-0.5">
      {/* Diamond wrapper — hit area */}
      <div className="relative flex items-center justify-center" style={{ width: diamondSize + 16, height: diamondSize + 16 }}>
        <div
          className="flex items-center justify-center"
          style={{
            width: diamondSize,
            height: diamondSize,
            background: data.bgColor ?? "#FFE082",
            border: `3px solid ${data.borderColor ?? "#FFB300"}`,
            borderRadius: 4,
            transform: "rotate(45deg)",
            boxShadow: selected
              ? "0 0 0 3px rgba(108,92,231,0.35), 0 3px 12px rgba(26,39,68,0.1)"
              : "0 3px 12px rgba(26,39,68,0.1)",
            transition: "box-shadow 150ms ease, transform 150ms cubic-bezier(0.22,1,0.36,1)",
          }}
        >
          <span
            className="font-extrabold not-italic"
            style={{
              transform: "rotate(-45deg)",
              color: data.labelColor ?? "#1A2744",
              fontSize: diamondSize * 0.38,
            }}
          >
            {glyph}
          </span>
        </div>
      </div>

      {/* Label pill */}
      <span
        className="max-w-[120px] rounded-sm px-2 py-0.5 text-center font-bold leading-tight"
        style={{
          fontSize: data.fontSize ?? 10,
          background: "rgba(255,255,255,0.9)",
          color: data.labelColor ?? "#1A2744",
        }}
      >
        {data.label}
      </span>

      <Handle type="target" position={Position.Left} id="west" className="bpmn-handle" />
      <Handle type="target" position={Position.Top} id="north" className="bpmn-handle" />
      <Handle type="source" position={Position.Right} id="east" className="bpmn-handle" />
      <Handle type="source" position={Position.Bottom} id="south" className="bpmn-handle" />
    </div>
  );
}

export const GatewayNode = memo(GatewayNodeInner);
