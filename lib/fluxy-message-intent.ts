export type FluxyIntent = "mark_blocked" | "shift_due_date" | "reassign" | "none";
export type FluxyDecision = "auto_applied" | "confirmation_required" | "no_action";
export type FluxyRisk = "low" | "medium" | "high";

export type FluxyIntentDetail = {
  intent: FluxyIntent;
  summary: string;
  risk: FluxyRisk;
  reason: string;
};

const CONFIRM_APPLY_PREFIX = /^\[confirmo aplicar\]\s*/i;

export function stripConfirmApplyPrefix(body: string): { forcedConfirm: boolean; rest: string } {
  const s = String(body || "").trim();
  if (CONFIRM_APPLY_PREFIX.test(s)) {
    return { forcedConfirm: true, rest: s.replace(CONFIRM_APPLY_PREFIX, "").trim() };
  }
  return { forcedConfirm: false, rest: s };
}

export function inferFluxyIntentDetail(body: string): FluxyIntentDetail {
  const text = String(body || "").toLowerCase();
  if (/(\/bloquear|\bbloquead[oa]\b|\bimpedid[oa]\b|\btravado\b|\btravada\b)/i.test(text)) {
    return {
      intent: "mark_blocked",
      summary: "Fluxy identificou pedido de bloqueio do card.",
      risk: "low",
      reason: "Mudança operacional de baixo risco com evidência textual explícita.",
    };
  }
  if (/(\/adiar|\bprazo\b|\bdue date\b|\bentrega\b|\bsexta\b|\bsegunda\b|\bamanhã\b)/i.test(text)) {
    return {
      intent: "shift_due_date",
      summary: "Fluxy detectou possível ajuste de prazo.",
      risk: "high",
      reason: "Alteração de prazo é sensível e requer confirmação explícita.",
    };
  }
  if (/(\/atribuir|\brespons[aá]vel\b|\bassumir\b)/i.test(text)) {
    return {
      intent: "reassign",
      summary: "Fluxy detectou possível mudança de responsável.",
      risk: "high",
      reason: "Reatribuição altera ownership e exige confirmação.",
    };
  }
  return {
    intent: "none",
    summary: "Fluxy não detectou ação operacional aplicável.",
    risk: "medium",
    reason: "Mensagem informativa sem comando claro de atualização de card.",
  };
}

export function policyDecisionForIntent(intent: FluxyIntent): FluxyDecision {
  if (intent === "mark_blocked") return "auto_applied";
  if (intent === "shift_due_date" || intent === "reassign") return "confirmation_required";
  return "no_action";
}

/** Alinhado ao motor de política (inclui [CONFIRMO APLICAR] para liberar ações sensíveis). */
export function classifyFluxyIntent(body: string): {
  intent: FluxyIntent;
  decision: FluxyDecision;
  detail: FluxyIntentDetail;
  forcedConfirm: boolean;
} {
  const { forcedConfirm, rest } = stripConfirmApplyPrefix(body);
  const detail = inferFluxyIntentDetail(forcedConfirm ? rest : body);
  let decision = policyDecisionForIntent(detail.intent);
  if (forcedConfirm && (detail.intent === "shift_due_date" || detail.intent === "reassign")) {
    decision = "auto_applied";
  }
  return { intent: detail.intent, decision, detail, forcedConfirm };
}

/** Para UI em mensagens salvas (sem simular confirmação). */
export function classifyFluxyIntentForDisplay(body: string): {
  intent: FluxyIntent;
  decision: FluxyDecision;
  detail: FluxyIntentDetail;
} {
  const { rest, forcedConfirm } = stripConfirmApplyPrefix(body);
  const detail = inferFluxyIntentDetail(forcedConfirm ? rest : body);
  return {
    intent: detail.intent,
    decision: policyDecisionForIntent(detail.intent),
    detail,
  };
}

export function parseDelayDaysFromText(text: string): number | null {
  const s = String(text || "");
  const m =
    s.match(/(?:\/adiar|adiar|\+)\s*(\d+)\s*d/i) ||
    s.match(/(\d+)\s*d(?:ias?)?/i) ||
    s.match(/(\d+)\s*d\b/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n)) return null;
  return Math.min(365, Math.max(1, n));
}
