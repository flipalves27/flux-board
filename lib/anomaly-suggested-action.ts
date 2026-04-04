import type { AnomalyAlertPayload } from "./anomaly-detection";
import type { BoardData } from "./kv-boards";
import { callTogetherApi, safeJsonParse } from "./llm-utils";

export function fallbackAnomalySuggestion(alert: AnomalyAlertPayload): string {
  switch (alert.kind) {
    case "wip_explosion":
      return "Limite WIP na coluna afetada, finalize itens antes de puxar novos cards e alinhe prioridades com o time.";
    case "throughput_drop":
      return "Revise capacidade da semana, remova bloqueios e quebre trabalhos grandes para recuperar ritmo de conclusão.";
    case "lead_time_spike":
      return "Identifique gargalos nas etapas mais lentas e reduza filas antes de aceitar novas entradas no fluxo.";
    case "stagnation_cluster":
      return "Facilite daily focada nos cards parados, desbloqueie dependências e mova ou renegocie prazos com stakeholders.";
    case "okr_drift":
      return "Realoque esforço para KRs em risco, corta escopo ou ajuste meta com sponsor — documente a decisão.";
    case "overdue_cascade":
      return "Priorize o que vence em 72h, negocie datas com cliente e concentre o time nos itens de maior risco.";
    case "cross_board_blocker_overdue":
      return "Alinhe com o time dono do bloqueador, negocie data ou desbloqueio, e atualize a dependência no card se o cenário mudou.";
    case "scope_creep":
      return "Congele novas entradas até a próxima planning, renegocie escopo com stakeholders e mova itens para um backlog de ‘próximo ciclo’.";
    default:
      return "Revise o board com o time, priorize desbloqueios e alinhe expectativas com stakeholders.";
  }
}

function compactBoardContext(board: BoardData, alert: AnomalyAlertPayload): string {
  const cards = Array.isArray(board.cards) ? board.cards : [];
  const colKey =
    alert.kind === "wip_explosion" && alert.diagnostics && typeof alert.diagnostics.columnKey === "string"
      ? String(alert.diagnostics.columnKey)
      : null;
  const lines: string[] = [
    `Board: ${board.name} (${board.id})`,
    `Total cards (não concluídos): ${cards.filter((c) => (c as { progress?: string }).progress !== "Concluída").length}`,
  ];
  if (colKey) {
    const inCol = cards.filter((c) => (c as { bucket?: string }).bucket === colKey && (c as { progress?: string }).progress !== "Concluída");
    lines.push(`Coluna alvo (${colKey}): ${inCol.length} cards`);
    inCol.slice(0, 8).forEach((c) => {
      const t = (c as { title?: string }).title || "(sem título)";
      const due = (c as { dueDate?: string | null }).dueDate;
      lines.push(`- ${t}${due ? ` (due ${due})` : ""}`);
    });
  } else {
    cards
      .filter((c) => (c as { progress?: string }).progress !== "Concluída")
      .slice(0, 12)
      .forEach((c) => {
        const t = (c as { title?: string }).title || "(sem título)";
        const bk = (c as { bucket?: string }).bucket || "";
        lines.push(`- [${bk}] ${t}`);
      });
  }
  return lines.join("\n");
}

export type AnomalySuggestedActionResult = {
  text: string;
  llmModel?: string;
  llmProvider?: string;
};

/**
 * Gera recomendação acionável em PT-BR (1–3 frases). Usa Together quando configurado.
 */
export async function generateAnomalySuggestedAction(args: {
  alert: AnomalyAlertPayload;
  board?: BoardData | null;
}): Promise<AnomalySuggestedActionResult> {
  const { alert, board } = args;
  const apiKey = process.env.TOGETHER_API_KEY;
  const model = process.env.TOGETHER_MODEL;
  if (!apiKey || !model) {
    return { text: fallbackAnomalySuggestion(alert) };
  }

  const sys =
    "Você é um coach ágil sênior. Responda SOMENTE JSON válido: {\"suggestedAction\":\"...\"}. " +
    "A sugestão deve ser em português do Brasil, específica ao contexto, acionável em até 350 caracteres, sem markdown.";

  const userParts = [
    `Anomalia: ${alert.title}`,
    `Tipo: ${alert.kind}`,
    `Severidade: ${alert.severity}`,
    `Resumo: ${alert.message}`,
    `Diagnóstico (JSON): ${JSON.stringify(alert.diagnostics ?? {})}`,
  ];
  if (board) {
    userParts.push("Contexto do board:\n" + compactBoardContext(board, alert));
  }

  const res = await callTogetherApi(
    {
      model,
      temperature: 0.35,
      max_tokens: 400,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: userParts.join("\n\n") },
      ],
    },
    { apiKey }
  );

  if (!res.ok) {
    console.warn("[anomaly-suggested-action]", res.error);
    return { text: fallbackAnomalySuggestion(alert) };
  }

  const parsed = safeJsonParse<{ suggestedAction?: string }>(res.assistantText);
  const text = typeof parsed?.suggestedAction === "string" ? parsed.suggestedAction.trim() : "";
  if (!text) {
    return { text: fallbackAnomalySuggestion(alert) };
  }
  return { text: text.slice(0, 400), llmModel: model, llmProvider: "together.ai" };
}
