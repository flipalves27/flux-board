"use client";

import { BPMN_FLOW_EDGE_STYLES } from "@/lib/bpmn-flow-tokens";
import type { BpmnEdgeKind } from "@/lib/bpmn-types";

const EDGE_KINDS: BpmnEdgeKind[] = ["default", "primary", "rework", "cross_lane", "system"];

/**
 * SVG <defs> with arrowhead markers for each BPMN edge kind.
 * Rendered once inside the React Flow SVG layer.
 */
export function BpmnEdgeMarkers() {
  return (
    <svg className="absolute" style={{ width: 0, height: 0 }}>
      <defs>
        {EDGE_KINDS.map((kind) => (
          <marker
            key={kind}
            id={`bpmn-arrow-${kind}`}
            viewBox="0 0 10 7"
            refX={9}
            refY={3.5}
            markerWidth={10}
            markerHeight={7}
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill={BPMN_FLOW_EDGE_STYLES[kind].marker} />
          </marker>
        ))}
        <marker
          id="bpmn-arrow-preview"
          viewBox="0 0 10 10"
          refX={9}
          refY={5}
          markerWidth={8}
          markerHeight={8}
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(56,189,248,0.95)" />
        </marker>
      </defs>
    </svg>
  );
}
