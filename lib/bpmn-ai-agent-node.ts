/**
 * Identificador reservado para nós de agente IA no editor BPMN + automation engine (roadmap).
 * UI/automation passam a reconhecer este tipo quando o builder visual for estendido.
 */
export const BPMN_AI_AGENT_NODE_TYPE = "flux_ai_agent_v1" as const;

export type BpmnAiAgentNodePayload = {
  type: typeof BPMN_AI_AGENT_NODE_TYPE;
  agentKind: "triage" | "planning" | "flow_guardian" | "dmaic_coach";
  autonomyLevel: 1 | 2 | 3 | 4;
  promptHint?: string;
};
