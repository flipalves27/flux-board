import { NextRequest } from "next/server";
import { canUseFeature } from "@/lib/plan-gates";
import { ensureSpecPlanAccess } from "@/lib/spec-plan-access";
import { parseSpecPlanFormData } from "@/lib/spec-plan-form-parse";
import {
  createStreamAccumulator,
  foldStreamEvent,
  persistSpecPlanRunSnapshot,
} from "@/lib/spec-plan-persist-stream";
import { runSpecPlanPipeline } from "@/lib/spec-plan-pipeline";

export const runtime = "nodejs";
/** PDFs longos: embeddings + 2–3 chamadas LLM; 120s cortava no meio da fase “itens”. */
export const maxDuration = 300;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: boardId } = await params;

  const access = await ensureSpecPlanAccess(request, boardId, { consumeAnalysisQuota: true });
  if (access instanceof Response) return access;

  const { payload, org, board, gateCtx } = access;

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

  const parsed = await parseSpecPlanFormData(formData);
  if (parsed instanceof Response) return parsed;

  const { methodology, remapOnly, documentText, extractMeta, workItemsJson } = parsed;
  const allowSubtasks = canUseFeature(org, "subtasks", gateCtx);

  const sourceSummary = remapOnly
    ? "Remapeamento de colunas"
    : extractMeta.kind === "text" && !extractMeta.fileName?.match(/\.(pdf|docx)$/i)
      ? extractMeta.fileName || "Texto colado"
      : extractMeta.fileName || "Documento";

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let acc = createStreamAccumulator(remapOnly);
      /** Cliente fechou a ligação ou o runtime cancelou o stream — evita enqueue após controller fechado. */
      let skipSseWrite = false;

      const sendEvent = (event: string, data: unknown) => {
        const dataObj = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
        acc = foldStreamEvent(acc, event, dataObj, remapOnly);
        if (skipSseWrite) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          skipSseWrite = true;
        }
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
        const errPayload = {
          message: e.message || "Erro interno",
          code: "pipeline_uncaught",
          cause: e.message,
          stack: process.env.NODE_ENV === "development" ? e.stack : undefined,
        };
        sendEvent("error", errPayload);
      } finally {
        await persistSpecPlanRunSnapshot({
          orgId: payload.orgId,
          boardId,
          userId: payload.id,
          methodology,
          remapOnly,
          sourceSummary,
          acc,
        });
        try {
          controller.close();
        } catch {
          /* já fechado (ex.: cliente abortou o fetch) */
        }
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
