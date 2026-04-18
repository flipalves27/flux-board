import type { BpmnEdgeKind, BpmnSemanticVariant } from "./bpmn-types";

/** Stroke + marker colors for BPMN flow edge kinds. */
export const BPMN_FLOW_EDGE_STYLES: Record<
  BpmnEdgeKind,
  { stroke: string; dash?: string; marker: string; width: number }
> = {
  default: { stroke: "var(--flux-bpmn-flow-default)", marker: "var(--flux-bpmn-flow-default)", width: 2 },
  primary: { stroke: "var(--flux-bpmn-flow-primary)", marker: "var(--flux-bpmn-flow-primary)", width: 2.5 },
  rework: { stroke: "var(--flux-bpmn-flow-rework)", marker: "var(--flux-bpmn-flow-rework)", width: 2, dash: "6 4" },
  cross_lane: {
    stroke: "var(--flux-bpmn-flow-cross-lane)",
    marker: "var(--flux-bpmn-flow-cross-lane)",
    width: 3,
    dash: "8 5",
  },
  system: { stroke: "var(--flux-bpmn-flow-system)", marker: "var(--flux-bpmn-flow-system)", width: 2 },
};

export const BPMN_TASK_VARIANT_STYLES: Record<
  BpmnSemanticVariant,
  { accent: string; badgeBg: string; bg: string; borderStyle: "solid" | "dashed" }
> = {
  default: {
    accent: "var(--flux-bpmn-teal-accent)",
    badgeBg: "var(--flux-bpmn-teal-accent)",
    bg: "color-mix(in srgb, white 96%, transparent)",
    borderStyle: "solid",
  },
  delivered: {
    accent: "var(--flux-bpmn-green-400)",
    badgeBg: "var(--flux-bpmn-green-400)",
    bg: "color-mix(in srgb, var(--flux-bpmn-prop-mint) 98%, transparent)",
    borderStyle: "solid",
  },
  automation: {
    accent: "var(--flux-bpmn-cyan-accent)",
    badgeBg: "var(--flux-bpmn-cyan-accent)",
    bg: "color-mix(in srgb, var(--flux-bpmn-prop-cyan-tint) 98%, transparent)",
    borderStyle: "solid",
  },
  pain: {
    accent: "var(--flux-bpmn-pain-red)",
    badgeBg: "var(--flux-bpmn-pain-red)",
    bg: "color-mix(in srgb, var(--flux-bpmn-prop-rose) 98%, transparent)",
    borderStyle: "solid",
  },
  system: {
    accent: "var(--flux-bpmn-indigo-accent)",
    badgeBg: "var(--flux-bpmn-indigo-accent)",
    bg: "color-mix(in srgb, var(--flux-bpmn-system-task-bg) 95%, transparent)",
    borderStyle: "dashed",
  },
};

/** Normaliza token legado `reborn` (persistido) para `delivered`. */
export function resolveBpmnTaskVariant(v: string | undefined): BpmnSemanticVariant {
  if (v === "reborn") return "delivered";
  if (v === "default" || v === "delivered" || v === "automation" || v === "pain" || v === "system") {
    return v;
  }
  return "default";
}

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
