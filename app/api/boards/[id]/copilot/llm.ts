import { runOrgLlmChat, type OrgLlmChatResult } from "@/lib/llm-org-chat";
import { isOrgCloudLlmConfigured, resolveInteractiveLlmRoute } from "@/lib/org-ai-routing";
import type { Organization } from "@/lib/kv-organizations";
import { getCopilotLlmHistoryMessageLimit, type CopilotMessageRole } from "@/lib/kv-board-copilot";
import { getEffectiveTier } from "@/lib/plan-gates";
import { type CopilotToolName, type CopilotModelOutput } from "./types";
import { buildCopilotContext, copilotHeuristicWhenNoLlm } from "./context-heuristics";
import { parseJsonFromLlmContent } from "./llm-json";

const PRIORITIES = ["Urgente", "Importante", "Média"] as const;
const PROGRESSES = ["Não iniciado", "Em andamento", "Concluída"] as const;
const DIRECTIONS = ["Manter", "Priorizar", "Adiar", "Cancelar", "Reavaliar"] as const;
const MAX_MODEL_CONTEXT_CARDS = 40;

function copilotLlmFailureReply(failed: Extract<OrgLlmChatResult, { ok: false }>): string {
  const err = failed.error || "";
  const status = failed.status;
  const snippet = failed.bodySnippet?.slice(0, 600) ?? "";
  console.error("[copilot] LLM call failed", {
    resolvedRoute: failed.resolvedRoute,
    provider: failed.provider,
    error: err,
    status,
  });

  if (err === "no_api_key") {
    return "Nenhuma chave API configurada para esta organização (ou no servidor). Configure o motor de IA nas definições da organização ou as variáveis de ambiente do deploy.";
  }
  if (err.startsWith("http_")) {
    const code = Number(err.slice(5));
    if (code === 401) {
      return "A API recusou a chave (401). Verifique a chave nas definições da organização ou as credenciais no servidor.";
    }
    if (code === 403) {
      return "Acesso negado pela API (403). Confira permissões da chave e faturamento.";
    }
    if (code === 400 || code === 404) {
      const hint = snippet ? ` (${snippet.slice(0, 220)}${snippet.length > 220 ? "…" : ""})` : "";
      return `Pedido rejeitado pela API (${code}). Confira o ID do modelo e a URL base (se aplicável).${hint}`;
    }
    if (code === 429) return "Limite de uso da API (429). Aguarde e tente de novo.";
    if (code === 503 || code === 529) return "Serviço do modelo sobrecarregado ou indisponível. Tente novamente em instantes.";
  }
  if (err === "network_error" || err.includes("fetch")) {
    return "Falha de rede ao contactar a API do modelo. Tente de novo ou confira firewall/DNS no ambiente de deploy.";
  }

  if (failed.error === "missing_user") return "Sessão inválida para chamar o modelo.";
  return `Falha ao chamar o modelo (${err || "erro desconhecido"}). Tente novamente em instantes.`;
}

export async function callCopilotLlmModel(input: {
  org: Organization;
  orgId: string;
  userId: string;
  isAdmin: boolean;
  board: Record<string, unknown>;
  boardName: string;
  userMessage: string;
  historyMessages: Array<{ role: CopilotMessageRole; content: string }>;
  tier: ReturnType<typeof getEffectiveTier>;
  worldSnapshot: string;
}): Promise<CopilotModelOutput> {
  const routePick = resolveInteractiveLlmRoute(input.org, { userId: input.userId, isAdmin: input.isAdmin });
  if (!isOrgCloudLlmConfigured(input.org)) {
    return copilotHeuristicWhenNoLlm({ board: input.board, userMessage: input.userMessage });
  }

  const providerLabel = () => "openai_compat";
  const llmHistLimit = getCopilotLlmHistoryMessageLimit();
  const ctx = buildCopilotContext(input.board);
  const cardsForPrompt = ctx.cards.slice(0, MAX_MODEL_CONTEXT_CARDS);
  const histForPrompt = input.historyMessages.slice(-llmHistLimit);

  const system = [
    "Você é a Fluxy, assistente de operações do Flux-Board: entende o board atual, OKRs da org, automações, documentos (RAG) e métricas de portfólio/relatórios.",
    "Use o `worldSnapshot` como visão agregada da organização; use o JSON do board abaixo para detalhes e IDs dos cards deste quadro.",
    "O snapshot inclui `Contexto ágil`: adapte tom e sugestões à metodologia (Scrum vs Kanban vs Lean Six Sigma), ao sprint ativo quando existir, e à heurística de cerimônia (ex.: daily recente).",
    "Priorize coerência entre OKRs, boards e docs quando a pergunta for estratégica ou cross-funcional.",
    "",
    "Regras obrigatórias:",
    "1) Responda SOMENTE com JSON puro, sem markdown, sem texto fora do JSON.",
    "2) O JSON DEVE ter as chaves: `reply` (string) e `actions` (array; pode ser vazio).",
    "3) `actions` só deve ser preenchido quando o usuário pedir explicitamente mudanças no board, como: mover card, ajustar prioridade, criar card.",
    "4) Para perguntas/sugestões (ex.: 'Quais cards estão parados...?', 'Resuma...', 'Sugira prioridades...'), normalmente `actions` deve ser vazio.",
    "5) Quando o usuário pedir um resumo/brief para diretoria, você pode usar tool `generateBrief` (não altera o board).",
    "",
    "Schema de ferramentas (tool-use):",
    "- moveCard: { tool: 'moveCard', args: { cardId: string, bucketKey?: string, bucketLabel?: string, bucket?: string, column?: string, targetIndex?: number, setProgress?: 'Não iniciado'|'Em andamento'|'Concluída' } } — para a coluna de destino use bucketKey OU bucketLabel igual a um item de `bucketOrder` (key ou label); `bucket`/`column` são sinônimos aceitos.",
    "- updatePriority: { tool: 'updatePriority', args: { cardId: string, priority: 'Urgente'|'Importante'|'Média' } }",
    "- createCard: { tool: 'createCard', args: { bucketKey?: string, bucketLabel?: string, bucket?: string, column?: string, title: string, desc?: string, tags?: string[], priority: 'Urgente'|'Importante'|'Média', progress: 'Não iniciado'|'Em andamento'|'Concluída', direction?: string|null, dueDate?: string|null } } — se não informar coluna, use bucketKey/bucketLabel da primeira coluna em `bucketOrder`.",
    "- generateBrief: { tool: 'generateBrief', args: { scope?: string } }",
    "- notifyStakeholders: { tool: 'notifyStakeholders', args: { message: string, userIds: string[], cardId?: string } } — envia mensagem na Sala Fluxy do board e dispara notificações push aos IDs listados (membros da org). Use cardId opcional para contexto do card na sala.",
    "",
    "Valores válidos (use exatamente):",
    `prioridades=${JSON.stringify(PRIORITIES)}`,
    `progresso=${JSON.stringify(PROGRESSES)}`,
    `direções=${JSON.stringify(DIRECTIONS)}`,
    "",
    "Contexto do board (para inferências e validação de IDs):",
    `boardName=${input.boardName}`,
    `portfolioMetrics=${JSON.stringify(ctx.portfolio)}`,
    `executionInsights=${JSON.stringify(ctx.executionInsights)}`,
    `bucketOrder=${JSON.stringify(ctx.bucketLabels)}`,
    `cards=${JSON.stringify(cardsForPrompt)}`,
    `activityHints=${JSON.stringify(ctx.activityHints.slice(0, 25))}`,
    `latestDailies=${JSON.stringify(ctx.latestDailies)}`,
    `worldSnapshot=${input.worldSnapshot}`,
    "",
    "Histórico do chat (para manter contexto; pode ignorar se não ajudar):",
    ...(histForPrompt.map((m) => `${m.role}: ${m.content.slice(0, 1500)}`) || []),
    "",
    `Mensagem do usuário: ${input.userMessage}`,
    "",
    "Saída esperada: JSON { reply: string, actions: Array }",
  ].join("\n");

  const res = await runOrgLlmChat({
    org: input.org,
    orgId: input.orgId,
    feature: "board_copilot",
    messages: [{ role: "user" as const, content: system }],
    options: { temperature: 0.2 },
    mode: "interactive",
    userId: input.userId,
    isAdmin: input.isAdmin,
  });

  if (!res.ok) {
    const modelHint = routePick.model || process.env.TOGETHER_MODEL || "meta-llama/Llama-3.3-70B-Instruct-Turbo";
    return {
      reply: copilotLlmFailureReply(res),
      actions: [],
      llm: {
        source: "cloud",
        model: modelHint,
        provider: providerLabel(),
      },
    };
  }

  const parsed = parseJsonFromLlmContent(res.assistantText || "");
  const obj = parsed.parsed && typeof parsed.parsed === "object" ? (parsed.parsed as Record<string, unknown>) : null;
  const reply = String(obj?.reply || "").trim();
  const actions = Array.isArray(obj?.actions) ? obj.actions : [];

  return {
    reply: reply || "Não foi possível gerar uma resposta estruturada. Tente reformular a pergunta.",
    actions: actions
      .filter((a) => a && typeof a === "object" && typeof (a as Record<string, unknown>).tool === "string")
      .map((a) => {
        const row = a as Record<string, unknown>;
        return {
          tool: row.tool as CopilotToolName,
          args: (row.args && typeof row.args === "object" ? row.args : {}) as Record<string, unknown>,
        };
      }),
    llm: { source: "cloud", model: res.model, provider: providerLabel() },
  };
}

