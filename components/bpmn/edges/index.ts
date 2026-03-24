import { OrthogonalEdge } from "./OrthogonalEdge";

export const bpmnEdgeTypes = {
  orthogonal: OrthogonalEdge,
} as const;

export { OrthogonalEdge };
export { BpmnEdgeMarkers } from "./markers";
