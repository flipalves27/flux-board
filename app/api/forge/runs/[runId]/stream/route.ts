import { NextRequest } from "next/server";
import { getForgeJob } from "@/lib/kv-forge";
import { requireForgeAuth, assertForgeTierAllowed, jsonPlanGate } from "@/lib/forge-api-common";
import { planGateCtxFromAuthPayload } from "@/lib/plan-gates";
import { runForgePipeline } from "@/lib/forge-pipeline";
import { publicSseErrorPayload } from "@/lib/public-api-error";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const ctx = await requireForgeAuth(request);
  if (ctx instanceof Response) return ctx;
  const gateCtx = planGateCtxFromAuthPayload(ctx.payload);
  try {
    assertForgeTierAllowed(ctx.org, "oneshot", gateCtx);
  } catch (e) {
    const j = jsonPlanGate(e);
    if (j) return j;
    throw e;
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* closed */
        }
      };

      try {
        const snap = await getForgeJob(ctx.payload.orgId, runId);
        if (!snap) {
          send("error", { message: "Run não encontrada" });
          controller.close();
          return;
        }
        if (["merged", "failed", "cancelled"].includes(snap.status)) {
          send("snapshot", { runId: snap._id, status: snap.status });
          send("done", { ok: true });
          controller.close();
          return;
        }

        await runForgePipeline({
          jobId: runId,
          orgId: ctx.payload.orgId,
          org: ctx.org,
          authPayload: ctx.payload,
          onEvent: (ev) => send(ev.event, ev.data),
        });

        const latest = await getForgeJob(ctx.payload.orgId, runId);
        if (latest) send("snapshot", { runId: latest._id, status: latest.status });
        send("done", { ok: true });
      } catch (err) {
        const payload = publicSseErrorPayload(err, "forge stream");
        send("error", { ...payload, code: "forge_stream" });
      } finally {
        try {
          controller.close();
        } catch {
          /* ignore */
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
