import { NextRequest } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import {
  assertFeatureAllowed,
  canUseFeature,
  getDailyAiCallsCap,
  getDailyAiCallsWindowMs,
  getEffectiveTier,
  makeDailyAiCallsRateLimitKey,
  planGateCtxFromAuthPayload,
  PlanGateError,
} from "@/lib/plan-gates";
import { rateLimit } from "@/lib/rate-limit";
import { extractSpecDocument } from "@/lib/spec-plan-extract";
import { runSpecPlanPipeline } from "@/lib/spec-plan-pipeline";
import { SpecPlanMethodologySchema } from "@/lib/spec-plan-schemas";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return new Response(JSON.stringify({ error: "Não autenticado" }), { status: 401 });
  }

  const { id: boardId } = await params;
  if (!boardId || boardId === "boards") {
    return new Response(JSON.stringify({ error: "ID do board é obrigatório" }), { status: 400 });
  }

  const org = await getOrganizationById(payload.orgId);
  if (!org) {
    return new Response(JSON.stringify({ error: "Org não encontrada" }), { status: 404 });
  }

  const gateCtx = planGateCtxFromAuthPayload(payload);
  try {
    assertFeatureAllowed(org, "spec_ai_scope_planner", gateCtx);
  } catch (err) {
    if (err instanceof PlanGateError) {
      return new Response(
        JSON.stringify({
          error: err.message,
          code: err.code,
          feature: err.feature,
          requiredTiers: err.requiredTiers,
        }),
        { status: err.status }
      );
    }
    throw err;
  }

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) {
    return new Response(JSON.stringify({ error: "Sem permissão para este board" }), { status: 403 });
  }

  const board = await getBoard(boardId, payload.orgId);
  if (!board) {
    return new Response(JSON.stringify({ error: "Board não encontrado" }), { status: 404 });
  }

  const tier = getEffectiveTier(org, gateCtx);
  const rl = await rateLimit({
    key: `boards:spec-plan:user:${payload.id}`,
    limit: 8,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: "Muitas análises. Tente novamente mais tarde." }), {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSeconds) },
    });
  }

  const llmCloudEnabled =
    (Boolean(process.env.TOGETHER_API_KEY) && Boolean(process.env.TOGETHER_MODEL)) || Boolean(process.env.ANTHROPIC_API_KEY);
  if (tier === "free" && llmCloudEnabled) {
    const cap = getDailyAiCallsCap(org, gateCtx);
    if (cap !== null) {
      const dailyKey = makeDailyAiCallsRateLimitKey(payload.orgId);
      const rlDaily = await rateLimit({
        key: dailyKey,
        limit: cap,
        windowMs: getDailyAiCallsWindowMs(),
      });
      if (!rlDaily.allowed) {
        return new Response(JSON.stringify({ error: "Limite diário de chamadas de IA atingido." }), { status: 403 });
      }
    }
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (e) {
    const cause = e instanceof Error ? e.message : String(e);
    console.error("[spec-plan/stream] formData parse failed", e);
    return new Response(
      JSON.stringify({
        error:
          "Não foi possível ler os dados enviados (multipart). Confirme o arquivo, o tamanho ou cole o texto da especificação.",
        errorCode: "FORM_DATA_INVALID",
        cause,
      }),
      { status: 400 }
    );
  }

  const methodologyRaw = String(formData.get("methodology") || "").trim().toLowerCase();
  const methodologyParsed = SpecPlanMethodologySchema.safeParse(methodologyRaw);
  if (!methodologyParsed.success) {
    return new Response(JSON.stringify({ error: "Metodologia inválida (scrum, kanban, lss)." }), { status: 400 });
  }
  const methodology = methodologyParsed.data;

  const remapOnly = String(formData.get("remapOnly") || "") === "1" || String(formData.get("remapOnly") || "") === "true";
  const workItemsJsonField = formData.get("workItemsJson");
  const workItemsJson = typeof workItemsJsonField === "string" ? workItemsJsonField : "";

  const fileEntry = formData.get("file");
  const pastedText = String(formData.get("pastedText") || "").trim();

  let documentText = "";
  let extractMeta: { kind: string; fileName: string; pageCount?: number; warnings: string[] } = {
    kind: "text",
    fileName: "remap",
    warnings: [],
  };

  if (!remapOnly) {
    let buffer: Buffer | undefined;
    let fileName = "spec";
    const isBlobLike =
      fileEntry &&
      typeof fileEntry === "object" &&
      typeof (fileEntry as Blob).arrayBuffer === "function" &&
      typeof (fileEntry as Blob).size === "number" &&
      (fileEntry as Blob).size > 0;
    if (isBlobLike) {
      const ab = await (fileEntry as Blob).arrayBuffer();
      buffer = Buffer.from(ab);
      fileName =
        fileEntry instanceof File && String(fileEntry.name || "").trim()
          ? String(fileEntry.name).trim()
          : "upload.pdf";
    }
    try {
      const extracted = await extractSpecDocument({ buffer, fileName, pastedText: pastedText || undefined });
      documentText = extracted.text;
      extractMeta = {
        kind: extracted.kind,
        fileName: extracted.fileName,
        pageCount: extracted.pageCount,
        warnings: extracted.warnings,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "extract_failed";
      console.error("[spec-plan/stream] extractSpecDocument", e);
      if (msg === "NO_INPUT") {
        return new Response(
          JSON.stringify({ error: "Envie um arquivo ou cole texto.", errorCode: "NO_INPUT" }),
          { status: 400 }
        );
      }
      if (msg === "FILE_TOO_LARGE") {
        return new Response(
          JSON.stringify({ error: "Arquivo acima do limite.", errorCode: "FILE_TOO_LARGE" }),
          { status: 400 }
        );
      }
      if (msg === "UNSUPPORTED_TYPE") {
        return new Response(
          JSON.stringify({ error: "Use PDF, DOCX ou texto colado.", errorCode: "UNSUPPORTED_TYPE" }),
          { status: 400 }
        );
      }
      if (msg === "EMPTY_DOCUMENT") {
        return new Response(
          JSON.stringify({
            error: "Não foi possível extrair texto. Cole o conteúdo manualmente ou use PDF com texto.",
            errorCode: "EMPTY_DOCUMENT",
          }),
          { status: 400 }
        );
      }
      if (msg === "PDF_EXTRACT_FAILED") {
        const cause =
          e instanceof Error && e.cause != null
            ? e.cause instanceof Error
              ? e.cause.message
              : String(e.cause)
            : undefined;
        return new Response(
          JSON.stringify({
            error:
              "Não foi possível processar o PDF no servidor (arquivo protegido, corrompido ou ambiente). Tente DOCX, outro PDF ou cole o texto da especificação.",
            errorCode: "PDF_EXTRACT_FAILED",
            cause,
          }),
          { status: 400 }
        );
      }
      return new Response(
        JSON.stringify({
          error: "Falha ao ler documento.",
          errorCode: "EXTRACT_UNKNOWN",
          cause: msg !== "extract_failed" ? msg : undefined,
        }),
        { status: 500 }
      );
    }
  } else {
    if (!workItemsJson.trim()) {
      return new Response(JSON.stringify({ error: "workItemsJson obrigatório para remapear." }), { status: 400 });
    }
  }

  const allowSubtasks = canUseFeature(org, "subtasks", gateCtx);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        sendEvent("status", { phase: "started", remapOnly });

        await runSpecPlanPipeline({
          org,
          orgId: payload.orgId,
          userId: payload.id,
          isAdmin: Boolean(payload.isAdmin),
          methodology,
          documentText,
          extractMeta,
          allowSubtasks,
          board,
          remapOnly: remapOnly ? { workItemsJson } : undefined,
          onEvent: (ev) => {
            sendEvent(ev.event, ev.data);
          },
        });

        sendEvent("done", { ok: true });
      } catch (err) {
        console.error("spec-plan stream pipeline", err);
        const e = err instanceof Error ? err : new Error(String(err));
        sendEvent("error", {
          message: e.message || "Erro interno",
          code: "pipeline_uncaught",
          cause: e.message,
          stack: process.env.NODE_ENV === "development" ? e.stack : undefined,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
