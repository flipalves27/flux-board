export const BPMN_NODE_TYPES = [
  "start_event",
  "intermediate_event",
  "timer_event",
  "message_event",
  "end_event",
  "task",
  "user_task",
  "service_task",
  "script_task",
  "call_activity",
  "sub_process",
  "exclusive_gateway",
  "parallel_gateway",
  "inclusive_gateway",
  "data_object",
  "annotation",
  "system_box",
] as const;

export type BpmnNodeType = (typeof BPMN_NODE_TYPES)[number];

/** Visual / process semantics for task-like nodes (Reborn reference). */
export type BpmnSemanticVariant = "default" | "reborn" | "automation" | "pain" | "system";

/** Sequence flow rendering: primary path, rework loop, cross–swimlane jump, or system integration. */
export type BpmnEdgeKind = "default" | "primary" | "rework" | "cross_lane" | "system";

export type BpmnPort = "north" | "east" | "south" | "west";

export type BpmnNode = {
  id: string;
  type: BpmnNodeType;
  label: string;
  x: number;
  y: number;
  laneId?: string;
  width?: number;
  height?: number;
  /** Secondary line under title (actor, system, detail). */
  subtitle?: string;
  /** Step index shown in badge (e.g. 1, 2b, A). */
  stepNumber?: string;
  semanticVariant?: BpmnSemanticVariant;
  /** Hover / inspector description. */
  tooltip?: string;
  /** Pain-point badge (e.g. 1, 2). */
  painBadge?: string;
};

export type BpmnEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
  kind?: BpmnEdgeKind;
  sourcePort?: BpmnPort;
  targetPort?: BpmnPort;
  waypoints?: Array<{ x: number; y: number }>;
};

export type BpmnLane = {
  id: string;
  label: string;
  y?: number;
  height?: number;
  /** Short tag pill (e.g. AS-IS — Subscrição). */
  tag?: string;
  /** Optional [startColor, endColor] override for the lane's gradient label bar. */
  gradient?: [string, string];
};

export type BpmnTemplateModel = {
  version: "bpmn-2.0-lite";
  name: string;
  lanes: BpmnLane[];
  nodes: BpmnNode[];
  edges: BpmnEdge[];
};

export type BpmnValidationIssue = {
  code: string;
  message: string;
  severity: "error" | "warning";
};

export type BpmnValidationResult = {
  ok: boolean;
  issues: BpmnValidationIssue[];
};

export function validateBpmnModel(model: BpmnTemplateModel): BpmnValidationResult {
  const issues: BpmnValidationIssue[] = [];
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const starts = model.nodes.filter((n) => n.type === "start_event");
  const ends = model.nodes.filter((n) => n.type === "end_event");

  if (starts.length !== 1) {
    issues.push({
      code: "start_event_count",
      severity: "error",
      message: "Modelo BPMN deve ter exatamente 1 Start Event.",
    });
  }
  if (ends.length < 1) {
    issues.push({
      code: "end_event_missing",
      severity: "error",
      message: "Modelo BPMN deve ter ao menos 1 End Event.",
    });
  }

  const inCount = new Map<string, number>();
  const outCount = new Map<string, number>();
  for (const n of model.nodes) {
    inCount.set(n.id, 0);
    outCount.set(n.id, 0);
  }
  for (const e of model.edges) {
    if (!byId.has(e.sourceId) || !byId.has(e.targetId)) {
      issues.push({
        code: "dangling_edge",
        severity: "error",
        message: `Fluxo ${e.id} referencia elemento inexistente.`,
      });
      continue;
    }
    outCount.set(e.sourceId, (outCount.get(e.sourceId) ?? 0) + 1);
    inCount.set(e.targetId, (inCount.get(e.targetId) ?? 0) + 1);
  }

  for (const n of model.nodes) {
    const incoming = inCount.get(n.id) ?? 0;
    const outgoing = outCount.get(n.id) ?? 0;
    if (n.type === "start_event" && incoming > 0) {
      issues.push({
        code: "start_with_incoming",
        severity: "error",
        message: `Start Event ${n.id} não pode ter fluxo de entrada.`,
      });
    }
    if (n.type === "end_event" && outgoing > 0) {
      issues.push({
        code: "end_with_outgoing",
        severity: "error",
        message: `End Event ${n.id} não pode ter fluxo de saída.`,
      });
    }
    if (n.type === "exclusive_gateway" || n.type === "parallel_gateway") {
      if (incoming < 1 || outgoing < 1) {
        issues.push({
          code: "gateway_flow",
          severity: "warning",
          message: `Gateway ${n.id} deve possuir entrada e saída.`,
        });
      }
    }
  }

  return {
    ok: issues.every((i) => i.severity !== "error"),
    issues,
  };
}

