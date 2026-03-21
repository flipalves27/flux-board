import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { callTogetherApi, safeJsonParse } from "@/lib/llm-utils";
import { rateLimit } from "@/lib/rate-limit";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { AutomationRuleSchema, zodErrorToMessage } from "@/lib/schemas";
import { z } from "zod";

const BodySchema = z.object({
  text: z.string().trim().min(12, "Descreva a regra com mais detalhes.").max(4000),
});

function previewFromRule(rule: z.infer<typeof AutomationRuleSchema>): string {
  const tr = rule.trigger;
  const ac = rule.action;
  let triggerPt = "";
  switch (tr.type) {
    case "card_moved_to_column":
      triggerPt = `Quando um card for movido para a coluna “${tr.columnKey}”.`;
      break;
    case "card_created_with_tag":
      triggerPt = `Quando um card for criado com a tag “${tr.tag}”.`;
      break;
    case "card_stuck_in_column":
      triggerPt = `Quando um card ficar mais de ${tr.days} dia(s) na coluna “${tr.columnKey}”.`;
      break;
    case "due_date_within_days":
      triggerPt = `Quando o prazo estiver a ${tr.days} dia(s) ou menos.`;
      break;
    case "form_submission":
      triggerPt = "Quando houver novo envio pelo Flux Forms.";
      break;
    case "board_completion_percent":
      triggerPt = `Quando o board atingir ${tr.percent}% de cards concluídos.`;
      break;
    default:
      triggerPt = "Gatilho configurado.";
  }

  let actionPt = "";
  switch (ac.type) {
    case "set_priority":
      actionPt = `Definir prioridade para “${ac.priority}”.`;
      break;
    case "set_progress":
      actionPt = `Definir progresso para “${ac.progress}”.`;
      break;
    case "set_priority_and_notify_owner":
      actionPt = `Definir prioridade “${ac.priority}” e notificar o dono do board.`;
      break;
    case "notify_owner_add_tag":
      actionPt = `Notificar o dono e adicionar a tag “${ac.tag}”.`;
      break;
    case "send_due_reminder_email":
      actionPt = "Enviar lembrete por e-mail (prazo).";
      break;
    case "classify_card_with_ai":
      actionPt = "Classificar o card com IA.";
      break;
    case "generate_executive_brief_email":
      actionPt = "Gerar briefing executivo por e-mail.";
      break;
    default:
      actionPt = "Ação configurada.";
  }

  return `${triggerPt} → ${actionPt}`;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id: boardId } = await params;
  if (!boardId || boardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) {
    return NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 });
  }

  const rl = await rateLimit({
    key: `boards:automations-interpret:user:${payload.id}`,
    limit: 30,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Muitas interpretações. Tente novamente mais tarde." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const apiKey = process.env.TOGETHER_API_KEY;
  const model = process.env.TOGETHER_MODEL || "meta-llama/Llama-3.3-70B-Instruct-Turbo";
  const baseUrl = (process.env.TOGETHER_BASE_URL || "https://api.together.xyz/v1").replace(/\/+$/, "");

  if (!apiKey) {
    return NextResponse.json({ error: "IA indisponível (TOGETHER_API_KEY)." }, { status: 503 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    const json = await request.json();
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
    }
    body = parsed.data;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const board = await getBoard(boardId, payload.orgId);
  if (!board) {
    return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });
  }

  const buckets = Array.isArray(board.config?.bucketOrder) ? board.config.bucketOrder : [];
  const columnKeysRaw = buckets
    .map((b) => {
      const rec = b as { key?: string; label?: string };
      return String(rec.key || "").trim();
    })
    .filter(Boolean)
    .slice(0, 40);
  const columnKeys = columnKeysRaw.length ? columnKeysRaw : ["Backlog"];

  const priorities = ["Urgente", "Importante", "Média"];
  const progresses = ["Não iniciado", "Em andamento", "Concluída"];

  const schemaDoc = `{
  "id": "string (id único, ex.: r_abc123)",
  "enabled": true,
  "name": "string opcional curto",
  "trigger": um de:
    { "type": "card_moved_to_column", "columnKey": "<uma das chaves de coluna>" }
    { "type": "card_created_with_tag", "tag": "string" }
    { "type": "card_stuck_in_column", "columnKey": "<chave>", "days": número 1-365 }
    { "type": "due_date_within_days", "days": número 0-90 }
    { "type": "form_submission" }
    { "type": "board_completion_percent", "percent": número 1-100 },
  "action": um de:
    { "type": "set_priority", "priority": "Urgente"|"Importante"|"Média" }
    { "type": "set_progress", "progress": "Não iniciado"|"Em andamento"|"Concluída" }
    { "type": "set_priority_and_notify_owner", "priority": "Urgente"|"Importante"|"Média" }
    { "type": "notify_owner_add_tag", "tag": "string curta" }
    { "type": "send_due_reminder_email" }
    { "type": "classify_card_with_ai" }
    { "type": "generate_executive_brief_email" }
}`;

  const system = `Você converte regras em linguagem natural (PT ou EN) em JSON válido para automação de Kanban.
Responda APENAS com um objeto JSON (sem markdown, sem texto fora do JSON).
Use exatamente o schema abaixo. columnKey deve ser uma das chaves listadas em colunas_permitidas.
${schemaDoc}`;

  const user = [
    `Board: ${String(board.name || "Board").slice(0, 200)}`,
    `colunas_permitidas (use columnKey igual a uma destas strings): ${JSON.stringify(columnKeys)}`,
    `prioridades válidas: ${JSON.stringify(priorities)}`,
    `progressos válidos: ${JSON.stringify(progresses)}`,
    "",
    "Regra em linguagem natural:",
    body.text,
  ].join("\n");

  try {
    const response = await callTogetherApi(
      {
        model,
        temperature: 0.1,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      },
      { apiKey, baseUrl }
    );

    if (!response.ok) {
      const errBody = response.bodySnippet || "";
      console.error("[automations/interpret] HTTP", response.status, errBody.slice(0, 400));
      return NextResponse.json({ error: "Falha ao interpretar com a IA." }, { status: 502 });
    }

    const raw = response.assistantText || "";
    const parsedObj = safeJsonParse(raw);
    if (!parsedObj || typeof parsedObj !== "object") {
      return NextResponse.json({ error: "A IA não retornou JSON válido. Reformule a regra." }, { status: 422 });
    }

    const validated = AutomationRuleSchema.safeParse(parsedObj);
    if (!validated.success) {
      return NextResponse.json(
        { error: `JSON inválido: ${zodErrorToMessage(validated.error)}` },
        { status: 422 }
      );
    }

    const rule = validated.data;
    const preview = previewFromRule(rule);

    return NextResponse.json({
      ok: true,
      rule,
      preview,
      model,
      llmProvider: "Together",
    });
  } catch (err) {
    console.error("[automations/interpret]", err);
    return NextResponse.json({ error: "Erro interno ao interpretar." }, { status: 500 });
  }
}
