import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import {
  canUseFeature,
  getDailyAiCallsCap,
  getDailyAiCallsWindowMs,
  makeDailyAiCallsRateLimitKey,
  planGateCtxForAuth,
} from "@/lib/plan-gates";
import { rateLimit } from "@/lib/rate-limit";
import { runOrgLlmChat } from "@/lib/llm-org-chat";
import {
  buildTriageMessages,
  parseTriageResponse,
  heuristicTriage,
} from "@/lib/smart-auto-triage";
import { zodErrorToMessage } from "@/lib/schemas";

const BodySchema = z.object({
  title: z.string().trim().min(2).max(500),
  desc: z.string().trim().max(4000).optional().default(""),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId } = await params;
  if (!boardId || boardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const org = await getOrganizationById(payload.orgId);
  const gateCtx = planGateCtxForAuth(payload.isAdmin);

  const board = await getBoard(boardId, payload.orgId);
  if (!board) return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
  }

  const { title, desc } = parsed.data;
  const cards = Array.isArray(board.cards) ? board.cards : [];
  const config = board.config ?? {};
  const columns = Array.isArray(config.columns)
    ? config.columns.map((c: Record<string, unknown>) => String(c.label || c.key || ""))
    : ["Backlog", "Em andamento", "Concluída"];
  const priorities = ["Urgente", "Importante", "Média"];

  const completedCards = cards
    .filter((c: Record<string, unknown>) => String(c.progress || "") === "Concluída")
    .map((c: Record<string, unknown>) => ({
      title: String(c.title || ""),
      priority: String(c.priority || ""),
      bucket: String(c.bucket || ""),
      tags: Array.isArray(c.tags) ? c.tags.filter((t: unknown) => typeof t === "string") : [],
      progress: String(c.progress || ""),
    }));

  const useAi = canUseFeature(org, "ai_card_writer", gateCtx);

  if (!useAi) {
    const fallback = heuristicTriage(title, completedCards, columns, priorities);
    return NextResponse.json({ ok: true, suggestion: fallback, source: "heuristic" });
  }

  const dailyCap = getDailyAiCallsCap(org, gateCtx);
  if (dailyCap !== null) {
    const rl = await rateLimit({
      key: makeDailyAiCallsRateLimitKey(payload.orgId),
      limit: dailyCap,
      windowMs: getDailyAiCallsWindowMs(),
    });
    if (!rl.allowed) {
      const fallback = heuristicTriage(title, completedCards, columns, priorities);
      return NextResponse.json({ ok: true, suggestion: fallback, source: "heuristic" });
    }
  }

  const messages = buildTriageMessages(title, desc, completedCards, [], columns, priorities);

  try {
    const res = await runOrgLlmChat({
      org,
      orgId: payload.orgId,
      feature: "auto_triage",
      mode: "interactive",
      userId: payload.id,
      isAdmin: payload.isAdmin,
      messages,
      options: { maxTokens: 500, temperature: 0.2 },
    });

    if (!res.ok) {
      const fallback = heuristicTriage(title, completedCards, columns, priorities);
      return NextResponse.json({ ok: true, suggestion: fallback, source: "heuristic" });
    }

    const suggestion = parseTriageResponse(res.assistantText ?? "");
    if (!suggestion) {
      const fallback = heuristicTriage(title, completedCards, columns, priorities);
      return NextResponse.json({ ok: true, suggestion: fallback, source: "heuristic" });
    }

    return NextResponse.json({ ok: true, suggestion, source: "ai", model: res.model });
  } catch {
    const fallback = heuristicTriage(title, completedCards, columns, priorities);
    return NextResponse.json({ ok: true, suggestion: fallback, source: "heuristic" });
  }
}
