import type { BpmnEdgeKind, BpmnSemanticVariant } from "./bpmn-types";

/** Stroke + marker colors for BPMN flow edge kinds. */
export const BPMN_FLOW_EDGE_STYLES: Record<
  BpmnEdgeKind,
  { stroke: string; dash?: string; marker: string; width: number }
> = {
  default:    { stroke: "#607D8B", marker: "#607D8B", width: 2 },
  primary:    { stroke: "#7CB342", marker: "#7CB342", width: 2.5 },
  rework:     { stroke: "#EF5350", marker: "#EF5350", width: 2, dash: "6 4" },
  cross_lane: { stroke: "#00897B", marker: "#00897B", width: 3, dash: "8 5" },
  system:     { stroke: "#42A5F5", marker: "#42A5F5", width: 2 },
};

export const BPMN_TASK_VARIANT_STYLES: Record<
  BpmnSemanticVariant,
  { accent: string; badgeBg: string; bg: string; borderStyle: "solid" | "dashed" }
> = {
  default: { accent: "#00897B", badgeBg: "#00897B", bg: "#FFFFFF", borderStyle: "solid" },
  reborn: { accent: "#7CB342", badgeBg: "#7CB342", bg: "#F1F8E9", borderStyle: "solid" },
  automation: { accent: "#00ACC1", badgeBg: "#00ACC1", bg: "#E0F7FA", borderStyle: "solid" },
  pain: { accent: "#EF5350", badgeBg: "#EF5350", bg: "#FFEBEE", borderStyle: "solid" },
  system: { accent: "#7E57C2", badgeBg: "#7E57C2", bg: "#EDE7F6", borderStyle: "dashed" },
};

export function isTaskLikeType(type: string): boolean {
  return (
    type === "task" ||
    type === "user_task" ||
    type === "service_task" ||
    type === "script_task" ||
    type === "call_activity" ||
    type === "sub_process"
  );
}
