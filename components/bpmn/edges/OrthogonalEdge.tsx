"use client";

import { memo } from "react";
import { BaseEdge, type EdgeProps } from "@xyflow/react";
import type { BpmnEdgeData } from "@/stores/bpmn-store";
import { BPMN_FLOW_EDGE_STYLES } from "@/lib/bpmn-flow-tokens";
import type { BpmnEdgeKind } from "@/lib/bpmn-types";

const GAP = 30;

/**
 * Builds an SVG path string using orthogonal (90-degree) segments.
 * Implements the routing algorithm from the technical document.
 */
function buildOrthogonalPath(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  sourcePosition: string | undefined,
  targetPosition: string | undefined,
): string {
  const sp = sourcePosition ?? "right";
  const tp = targetPosition ?? "left";

  // Direct horizontal
  if (sp === "right" && tp === "left") {
    if (Math.abs(sy - ty) < 3 && sx < tx) {
      return `M ${sx} ${sy} L ${tx} ${ty}`;
    }
    const mx = Math.round(sx + (tx - sx) / 2);
    return `M ${sx} ${sy} L ${mx} ${sy} L ${mx} ${ty} L ${tx} ${ty}`;
  }

  // Direct vertical
  if (sp === "bottom" && tp === "top") {
    if (Math.abs(sx - tx) < 3 && sy < ty) {
      return `M ${sx} ${sy} L ${tx} ${ty}`;
    }
    const my = Math.round(sy + (ty - sy) / 2);
    return `M ${sx} ${sy} L ${sx} ${my} L ${tx} ${my} L ${tx} ${ty}`;
  }

  // Top to left
  if (sp === "top" && tp === "left") {
    const gapY = sy - GAP;
    return `M ${sx} ${sy} L ${sx} ${gapY} L ${tx} ${gapY} L ${tx} ${ty}`;
  }

  // Bottom to left
  if (sp === "bottom" && tp === "left") {
    const gapY = sy + GAP;
    return `M ${sx} ${sy} L ${sx} ${gapY} L ${tx} ${gapY} L ${tx} ${ty}`;
  }

  // Left to left (loop-back)
  if (sp === "left" && tp === "left") {
    const loopX = Math.min(sx, tx) - 50;
    return `M ${sx} ${sy} L ${loopX} ${sy} L ${loopX} ${ty} L ${tx} ${ty}`;
  }

  // Right to right
  if (sp === "right" && tp === "right") {
    const loopX = Math.max(sx, tx) + 50;
    return `M ${sx} ${sy} L ${loopX} ${sy} L ${loopX} ${ty} L ${tx} ${ty}`;
  }

  // Right to top
  if (sp === "right" && tp === "top") {
    return `M ${sx} ${sy} L ${tx} ${sy} L ${tx} ${ty}`;
  }

  // Right to bottom
  if (sp === "right" && tp === "bottom") {
    return `M ${sx} ${sy} L ${tx} ${sy} L ${tx} ${ty}`;
  }

  // Bottom to right
  if (sp === "bottom" && tp === "right") {
    return `M ${sx} ${sy} L ${sx} ${ty} L ${tx} ${ty}`;
  }

  // Top to right
  if (sp === "top" && tp === "right") {
    return `M ${sx} ${sy} L ${sx} ${ty} L ${tx} ${ty}`;
  }

  // Default: midpoint routing
  const mx = Math.round(sx + (tx - sx) / 2);
  return `M ${sx} ${sy} L ${mx} ${sy} L ${mx} ${ty} L ${tx} ${ty}`;
}

function OrthogonalEdgeInner(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    selected,
  } = props;
  const edgeData = data as BpmnEdgeData | undefined;
  const kind: BpmnEdgeKind = edgeData?.bpmnKind ?? "default";
  const style = BPMN_FLOW_EDGE_STYLES[kind];

  const path = buildOrthogonalPath(
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  );

  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;
  const labelText = edgeData?.label;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: selected ? "#38bdf8" : style.stroke,
          strokeWidth: selected ? style.width + 0.5 : style.width,
          strokeDasharray: style.dash,
          fill: "none",
          transition: "stroke 150ms ease, stroke-width 100ms ease",
        }}
        markerEnd={`url(#bpmn-arrow-${kind})`}
      />
      {labelText && (
        <foreignObject
          x={midX - 40}
          y={midY - 12}
          width={80}
          height={24}
          className="pointer-events-none overflow-visible"
        >
          <div className="flex items-center justify-center">
            <span
              className="rounded px-1.5 py-0.5 text-center text-[10px] font-bold leading-tight"
              style={{
                background: "rgba(255,255,255,0.92)",
                color: selected ? "#38bdf8" : style.stroke,
                boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
              }}
            >
              {labelText}
            </span>
          </div>
        </foreignObject>
      )}
    </>
  );
}

export const OrthogonalEdge = memo(OrthogonalEdgeInner);
