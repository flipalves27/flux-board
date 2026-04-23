import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { runOrgLlmChat } from "@/lib/llm-org-chat";
import { isOrgCloudLlmConfigured } from "@/lib/org-ai-routing";
import { rateLimit } from "@/lib/rate-limit";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import {
  assertFeatureAllowed,
  planGateCtxFromAuthPayload,
  PlanGateError,
} from "@/lib/plan-gates";
import { publicApiErrorResponse } from "@/lib/public-api-error";
import { denyPlan } from "@/lib/api-authz";

type SuggestedCard = {
  title: string;
  description: string;
  priority: string;
};

type StandupSummaryResult = {
  summary: string;
  impediments: string[];
  suggestedCards: SuggestedCard[];
};

type DailyInsightEntryInput = {
  id?: string;
  createdAt?: string;
  transcript?: string;
  insight?: {
    resumo?: string;
    contextoOrganizado?: string;
    criar?: string[];
    criarDetalhes?: { titulo?: string; descricao?: string; prioridade?: string }[];
    ajustar?: { titulo?: string; descricao?: string }[];
    corrigir?: { titulo?: string; descricao?: string }[];
    pendencias?: { titulo?: string; descricao?: string }[];
  };
};

function heuristicSummary(insights: DailyInsightEntryInput[]): StandupSummaryResult {
  const summaryParts: string[] = [];
  const impediments: string[] = [];
  const suggestedCards: SuggestedCard[] = [];

  for (const entry of insights.slice(0, 10)) {
    const insight = entry.insight;
    if (!insight) continue;

    if (insight.resumo) {
      summaryParts.push(insight.resumo);
    }

    if (Array.isArray(insight.pendencias)) {
      for (const p of insight.pendencias.slice(0, 5)) {
        const title = String(p?.titulo || "").trim();
        if (title) impediments.push(title);
      }
    }

    if (Array.isArray(insight.corrigir)) {
      for (const c of insight.corrigir.slice(0, 3)) {
        const title = String(c?.titulo || "").trim();
        if (title) impediments.push(`Fix: ${title}`);
      }
    }

    if (Array.isArray(insight.criarDetalhes)) {
      for (const item of insight.criarDetalhes.slice(0, 5)) {
        const title = String(item?.titulo || "").trim();
        if (!title) continue;
        suggestedCards.push({
          title,
          description: String(item?.descricao || "").trim(),
          priority: String(item?.prioridade || "Média").trim(),
        });
      }
    }
  }

  const uniqueImpediments = [...new Set(impediments)].slice(0, 10);
  const uniqueCards = suggestedCards.slice(0, 10);

  return {
    summary: summaryParts.length
      ? summaryParts.join("\n\n").slice(0, 3000)
      : "No sufficient data to generate a consolidated summary.",
    impediments: uniqueImpediments,
    suggestedCards: uniqueCards,
  };
}

function parseLlmResponse(content: string): StandupSummaryResult | null {
  const raw = String(content || "").trim();
  if (!raw) return null;

  const extractJson = (text: string): unknown => {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const candidate = fenced ? fenced[1].trim() : text;

    const start = candidate.indexOf("{");
    if (start < 0) return null;
    let depth = 0;
    let inStr = false;
    let escaped = false;
    for (let i = start; i < candidate.length; i++) {
      const ch = candidate[i];
      if (inStr) {
        if (escaped) { escaped = false; continue; }
        if (ch === "\\") { escaped = true; continue; }
        if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') { inStr = true; continue; }
      if (ch === "{") depth++;
      if (ch === "}") {
        depth--;
        if (depth === 0) {
          const slice = candidate
            .slice(start, i + 1)
            .replace(/,\s*([}\]])/g, "$1");
          return JSON.parse(slice);
        }
      }
    }
    return null;
  };

  try {
    const obj = extractJson(raw) as Record<string, unknown> | null;
    if (!obj) return null;

    return {
      summary: String(obj.summary || "").trim().slice(0, 4000),
      impediments: Array.isArray(obj.impediments)
        ? obj.impediments.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 15)
        : [],
      suggestedCards: Array.isArray(obj.suggestedCards)
        ? (obj.suggestedCards as Record<string, unknown>[])
            .map((c) => ({
              title: String(c.title || "").trim().slice(0, 120),
              description: String(c.description || "").trim().slice(0, 1600),
              priority: String(c.priority || "Média").trim(),
            }))
            .filter((c) => c.title)
            .slice(0, 15)
        : [],
    };
  } catch {
    return null;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: boardId } = await params;
  if (!boardId || boardId === "boards") {
    return NextResponse.json({ error: "Board ID is required" }, { status: 400 });
  }

  const org = await getOrganizationById(payload.orgId);
  const gateCtx = planGateCtxFromAuthPayload(payload);
  try {
    assertFeatureAllowed(org, "daily_insights", gateCtx);
  } catch (err) {
    if (err instanceof PlanGateError) return denyPlan(err);
    throw err;
  }

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) {
    return NextResponse.json({ error: "No permission for this board" }, { status: 403 });
  }

  const rl = await rateLimit({
    key: `boards:standup-summary:user:${payload.id}`,
    limit: 8,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  try {
    const body = (await request.json()) as {
      boardId?: string;
      dailyInsights?: DailyInsightEntryInput[];
    };

    const insights = Array.isArray(body?.dailyInsights) ? body.dailyInsights : [];
    if (!insights.length) {
      return NextResponse.json(
        { error: "At least one daily insight entry is required" },
        { status: 400 }
      );
    }

    if (!isOrgCloudLlmConfigured(org)) {
      return NextResponse.json({
        summary: heuristicSummary(insights).summary,
        impediments: heuristicSummary(insights).impediments,
        suggestedCards: heuristicSummary(insights).suggestedCards,
        generatedWithAI: false,
      });
    }

    const board = await getBoard(boardId, payload.orgId);
    const boardName = board?.name || "Board";

    const insightSummaries = insights
      .slice(0, 10)
      .map((entry, idx) => {
        const insight = entry.insight;
        if (!insight) return `Entry ${idx + 1}: No insight data.`;
        const parts: string[] = [];
        if (insight.resumo) parts.push(`Summary: ${insight.resumo}`);
        if (Array.isArray(insight.pendencias) && insight.pendencias.length) {
          parts.push(
            `Pending/Blockers: ${insight.pendencias.map((p) => p.titulo || "").filter(Boolean).join(", ")}`
          );
        }
        if (Array.isArray(insight.corrigir) && insight.corrigir.length) {
          parts.push(
            `Fixes needed: ${insight.corrigir.map((c) => c.titulo || "").filter(Boolean).join(", ")}`
          );
        }
        if (Array.isArray(insight.criarDetalhes) && insight.criarDetalhes.length) {
          parts.push(
            `Items to create: ${insight.criarDetalhes.map((c) => c.titulo || "").filter(Boolean).join(", ")}`
          );
        }
        return `Entry ${idx + 1} (${entry.createdAt || "unknown date"}):\n${parts.join("\n")}`;
      })
      .join("\n\n");

    const prompt = [
      "You are a senior engineering manager consolidating daily standup insights for a team.",
      `Board: ${boardName}`,
      "",
      "Below are the daily insight entries from the team:",
      insightSummaries.slice(0, 8000),
      "",
      "Generate a JSON object with exactly these keys:",
      '- "summary": a consolidated team status paragraph (2-5 sentences) identifying what was accomplished, what is in progress, and what needs attention.',
      '- "impediments": an array of strings listing cross-team impediments and blockers identified across all entries.',
      '- "suggestedCards": an array of objects, each with "title" (string, max 9 words), "description" (string, 1-3 sentences), and "priority" ("Urgente" | "Importante" | "Média") for follow-up cards that should be created.',
      "",
      "Return ONLY the JSON object. No markdown fences. No extra text.",
    ].join("\n");

    const response = await runOrgLlmChat({
      org,
      orgId: payload.orgId,
      feature: "standup_summary",
      messages: [{ role: "user", content: prompt }],
      options: { temperature: 0.25 },
      mode: "interactive",
      userId: payload.id,
      isAdmin: payload.isAdmin,
    });

    if (!response.ok) {
      const fallback = heuristicSummary(insights);
      return NextResponse.json({
        ...fallback,
        generatedWithAI: false,
      });
    }

    const parsed = parseLlmResponse(response.assistantText || "");
    if (!parsed) {
      const fallback = heuristicSummary(insights);
      return NextResponse.json({
        ...fallback,
        generatedWithAI: false,
      });
    }

    return NextResponse.json({
      ...parsed,
      generatedWithAI: true,
      model: response.model,
      provider: response.provider,
    });
  } catch (err) {
    console.error("Standup summary API error:", err);
    return publicApiErrorResponse(err, { context: "api/boards/[id]/standup-summary/route.ts", fallbackMessage: "Internal error" });
  }
}
