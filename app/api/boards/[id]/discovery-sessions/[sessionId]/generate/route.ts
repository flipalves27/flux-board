import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import {
  heuristicDiscoveryCardDrafts,
  heuristicDiscoveryMarkdown,
  normalizeDiscoveryCardDrafts,
  parseDiscoveryLlmJson,
} from "@/lib/discovery-llm-output";
import { createDoc } from "@/lib/kv-docs";
import { getDiscoverySessionById, updateDiscoverySession, type DiscoveryCardDraft } from "@/lib/kv-discovery-sessions";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { runOrgLlmChat } from "@/lib/llm-org-chat";
import { fluxyPromptPrefix } from "@/lib/fluxy-persona";
import {
  assertFeatureAllowed,
  getDailyAiCallsCap,
  getDailyAiCallsWindowMs,
  getEffectiveTier,
  makeDailyAiCallsRateLimitKey,
  planGateCtxFromAuthPayload,
  PlanGateError,
} from "@/lib/plan-gates";
import { publicApiErrorResponse } from "@/lib/public-api-error";
import { rateLimit } from "@/lib/rate-limit";

const SYS = [
  "Você é PM técnico no Flux. Com base nas respostas de um formulário de discovery, produza:",
  "1) markdown: documento técnico em pt-BR com secções fixas:",
  "Resumo executivo; Problema e utilizadores; Necessidades e restrições; Soluções discutidas;",
  "Recomendação técnica; Riscos e dependências; Roadmap sugerido (fases com marcos, datas relativas se fizer sentido).",
  "2) cards: array de rascunhos de cards Kanban.",
  "Regras: não invente factos fora das respostas; marque incertezas explicitamente quando necessário.",
  "cards[]: cada item com title (<=200), description (markdown ou texto, <=4000), bucketKey (uma das chaves permitidas),",
  "priority um de: Urgente | Importante | Média, dueDate ISO opcional ou null, tags array de strings curtas.",
  "Responda com um ÚNICO objeto JSON válido (sem markdown fences) no formato:",
  '{"markdown":"...","cards":[{"title":"...","description":"...","bucketKey":"...","priority":"Média","dueDate":null,"tags":[]}]}',
].join(" ");

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId, sessionId } = await params;
  if (!boardId || !sessionId) return NextResponse.json({ error: "Parâmetros em falta." }, { status: 400 });

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão para o board." }, { status: 403 });

  const org = await getOrganizationById(payload.orgId);
  const gateCtx = planGateCtxFromAuthPayload(payload);
  try {
    assertFeatureAllowed(org, "flux_docs", gateCtx);
  } catch (err) {
    if (err instanceof PlanGateError) {
      return NextResponse.json(
        { error: err.message, code: err.code, feature: err.feature, requiredTiers: err.requiredTiers },
        { status: err.status }
      );
    }
    throw err;
  }

  const session = await getDiscoverySessionById(payload.orgId, boardId, sessionId);
  if (!session) return NextResponse.json({ error: "Sessão não encontrada." }, { status: 404 });
  if (session.status !== "submitted" && session.status !== "processed") {
    return NextResponse.json({ error: "A sessão ainda não tem respostas submetidas." }, { status: 400 });
  }
  if (!session.responses || Object.keys(session.responses).length === 0) {
    return NextResponse.json({ error: "Respostas em falta." }, { status: 400 });
  }

  const board = await getBoard(boardId, payload.orgId);
  if (!board) return NextResponse.json({ error: "Board não encontrado." }, { status: 404 });

  const rl = await rateLimit({
    key: `discovery:generate:user:${payload.id}`,
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Muitas gerações. Tente novamente mais tarde." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const tier = getEffectiveTier(org, gateCtx);
  if (tier === "free") {
    const cap = getDailyAiCallsCap(org, gateCtx);
    if (cap !== null) {
      const rlDaily = await rateLimit({
        key: makeDailyAiCallsRateLimitKey(payload.orgId),
        limit: cap,
        windowMs: getDailyAiCallsWindowMs(),
      });
      if (!rlDaily.allowed) {
        return NextResponse.json({ error: "Limite diário de chamadas de IA atingido." }, { status: 403 });
      }
    }
  }

  const bucketOrder = Array.isArray(board.config?.bucketOrder) ? board.config!.bucketOrder! : [];
  const bucketKeys = bucketOrder
    .map((b) => (b && typeof b === "object" ? String((b as { key?: string }).key || "") : ""))
    .filter(Boolean);
  const firstBucket = bucketKeys[0] || "backlog";

  const userPayload = [
    "### Respostas (JSON)",
    JSON.stringify(session.responses, null, 2),
    "",
    "### bucketKey permitidos",
    bucketKeys.join(", ") || firstBucket,
  ].join("\n");

  let markdown = "";
  let cardDrafts: DiscoveryCardDraft[] = [];
  let usedLlm = false;

  const llm = await runOrgLlmChat({
    org,
    orgId: payload.orgId,
    feature: "flux_docs",
    messages: [
      { role: "system", content: SYS },
      { role: "user", content: fluxyPromptPrefix() + userPayload },
    ],
    options: { temperature: 0.25, maxTokens: 6000 },
    mode: "interactive",
    userId: payload.id,
    isAdmin: payload.isAdmin,
  });

  if (llm.ok) {
    const parsed = parseDiscoveryLlmJson(llm.assistantText || "");
    if (parsed) {
      markdown = parsed.markdown.trim();
      cardDrafts = normalizeDiscoveryCardDrafts(parsed.cards, bucketKeys, firstBucket);
      usedLlm = true;
    }
  }

  if (!markdown) {
    markdown = heuristicDiscoveryMarkdown(session, `Discovery — ${session.boardTitleSnapshot}`);
  }
  if (!cardDrafts.length) {
    cardDrafts = heuristicDiscoveryCardDrafts(session, firstBucket);
  }

  const docTitle = `Discovery — ${session.boardTitleSnapshot} — ${session.id}`;
  const tags = [
    "discovery-session",
    `board:${boardId}`,
    `session:${sessionId}`,
    "ia-docs",
    "generated",
  ];

  const doc = await createDoc({
    orgId: payload.orgId,
    title: docTitle.slice(0, 200),
    contentMd: markdown,
    tags,
  });

  const now = new Date().toISOString();
  const updated = await updateDiscoverySession(payload.orgId, boardId, sessionId, {
    status: "processed",
    processedAt: now,
    docId: doc.id,
    cardDrafts,
  });

  return NextResponse.json({
    ok: true,
    usedLlm,
    doc: { id: doc.id, title: doc.title },
    cardDrafts,
    session: updated,
  });
}
