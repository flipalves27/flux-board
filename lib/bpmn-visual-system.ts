export type BpmnVisualCategory = "event" | "task" | "gateway" | "artifact";

export type BpmnVisualState = "default" | "hover" | "selected" | "dragging" | "invalid" | "connected" | "disabled";

export type BpmnNodeVisualSpec = {
  type: string;
  category: BpmnVisualCategory;
  shape: "circle" | "rounded-rect" | "diamond" | "document";
  icon: string;
  borderStyle: "solid" | "double" | "thick";
  colorToken: string;
  labelRequired: boolean;
  fallback: "generic_task";
};

export const BPMN_VISUAL_TOKENS = {
  stroke: 1.5,
  strokeEmphasis: 2.5,
  radius: 8,
  iconSize: 16,
  spacing: 8,
  connectorStroke: 2,
  sequenceArrowSize: 7,
  associationDash: "6 4",
  labelStyle: {
    fontFamily: "Barlow, system-ui, sans-serif",
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1.35,
  },
  minReadableZoom: 0.36,
  minLabelWidth: 56,
  minContrastRatio: 4.5,
  semanticPalette: {
    eventStart: "#43A047",
    eventIntermediate: "#F9A825",
    eventEnd: "#E53935",
    task: "#00897B",
    gateway: "#FFB300",
    artifact: "#90A4AE",
    invalid: "#EF5350",
    selected: "#4DB6AC",
  },
} as const;

export const BPMN_VISUAL_STATE_TOKENS: Record<BpmnVisualState, { opacity: number; strokeScale: number; glow: "none" | "soft" | "strong" }> = {
  default: { opacity: 1, strokeScale: 1, glow: "none" },
  hover: { opacity: 1, strokeScale: 1.05, glow: "soft" },
  selected: { opacity: 1, strokeScale: 1.15, glow: "strong" },
  dragging: { opacity: 0.92, strokeScale: 1, glow: "soft" },
  invalid: { opacity: 1, strokeScale: 1.1, glow: "strong" },
  connected: { opacity: 1, strokeScale: 1.05, glow: "soft" },
  disabled: { opacity: 0.45, strokeScale: 1, glow: "none" },
};

export const BPMN_VISUAL_SPEC: ReadonlyArray<BpmnNodeVisualSpec> = [
  {
    type: "start_event",
    category: "event",
    shape: "circle",
    icon: "play",
    borderStyle: "solid",
    colorToken: "eventStart",
    labelRequired: true,
    fallback: "generic_task",
  },
  {
    type: "intermediate_event",
    category: "event",
    shape: "circle",
    icon: "ring",
    borderStyle: "double",
    colorToken: "eventIntermediate",
    labelRequired: true,
    fallback: "generic_task",
  },
  {
    type: "timer_event",
    category: "event",
    shape: "circle",
    icon: "clock",
    borderStyle: "double",
    colorToken: "eventIntermediate",
    labelRequired: true,
    fallback: "generic_task",
  },
  {
    type: "message_event",
    category: "event",
    shape: "circle",
    icon: "mail",
    borderStyle: "double",
    colorToken: "eventIntermediate",
    labelRequired: true,
    fallback: "generic_task",
  },
  {
    type: "end_event",
    category: "event",
    shape: "circle",
    icon: "stop",
    borderStyle: "thick",
    colorToken: "eventEnd",
    labelRequired: true,
    fallback: "generic_task",
  },
  {
    type: "task",
    category: "task",
    shape: "rounded-rect",
    icon: "check",
    borderStyle: "solid",
    colorToken: "task",
    labelRequired: true,
    fallback: "generic_task",
  },
  {
    type: "user_task",
    category: "task",
    shape: "rounded-rect",
    icon: "user",
    borderStyle: "solid",
    colorToken: "task",
    labelRequired: true,
    fallback: "generic_task",
  },
  {
    type: "service_task",
    category: "task",
    shape: "rounded-rect",
    icon: "gear",
    borderStyle: "solid",
    colorToken: "task",
    labelRequired: true,
    fallback: "generic_task",
  },
  {
    type: "script_task",
    category: "task",
    shape: "rounded-rect",
    icon: "code",
    borderStyle: "solid",
    colorToken: "task",
    labelRequired: true,
    fallback: "generic_task",
  },
  {
    type: "call_activity",
    category: "task",
    shape: "rounded-rect",
    icon: "replay",
    borderStyle: "double",
    colorToken: "task",
    labelRequired: true,
    fallback: "generic_task",
  },
  {
    type: "sub_process",
    category: "task",
    shape: "rounded-rect",
    icon: "plus-box",
    borderStyle: "solid",
    colorToken: "task",
    labelRequired: true,
    fallback: "generic_task",
  },
  {
    type: "exclusive_gateway",
    category: "gateway",
    shape: "diamond",
    icon: "x",
    borderStyle: "solid",
    colorToken: "gateway",
    labelRequired: true,
    fallback: "generic_task",
  },
  {
    type: "parallel_gateway",
    category: "gateway",
    shape: "diamond",
    icon: "plus",
    borderStyle: "solid",
    colorToken: "gateway",
    labelRequired: true,
    fallback: "generic_task",
  },
  {
    type: "inclusive_gateway",
    category: "gateway",
    shape: "diamond",
    icon: "circle",
    borderStyle: "solid",
    colorToken: "gateway",
    labelRequired: true,
    fallback: "generic_task",
  },
  {
    type: "data_object",
    category: "artifact",
    shape: "document",
    icon: "file",
    borderStyle: "solid",
    colorToken: "artifact",
    labelRequired: false,
    fallback: "generic_task",
  },
  {
    type: "annotation",
    category: "artifact",
    shape: "rounded-rect",
    icon: "note",
    borderStyle: "solid",
    colorToken: "artifact",
    labelRequired: false,
    fallback: "generic_task",
  },
  {
    type: "system_box",
    category: "artifact",
    shape: "rounded-rect",
    icon: "gear",
    borderStyle: "solid",
    colorToken: "artifact",
    labelRequired: true,
    fallback: "generic_task",
  },
] as const;

export const BPMN_VISUAL_FALLBACK: BpmnNodeVisualSpec = {
  type: "generic_task",
  category: "task",
  shape: "rounded-rect",
  icon: "question",
  borderStyle: "solid",
  colorToken: "task",
  labelRequired: true,
  fallback: "generic_task",
};

export function getBpmnVisualSpec(type: string): BpmnNodeVisualSpec {
  return BPMN_VISUAL_SPEC.find((entry) => entry.type === type) ?? BPMN_VISUAL_FALLBACK;
}
