import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { userCanAccessBoard } from "@/lib/kv-boards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SSE heartbeat para evolução futura (agentes, Flow Guardian).
 * Hoje: mantém conexão viva com ping periódico — cliente pode reconectar com backoff.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id: boardId } = await params;
  if (!boardId || boardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }

  const ok = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!ok) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const encoder = new TextEncoder();
  let interval: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      send("ready", { boardId, t: Date.now() });
      interval = setInterval(() => send("ping", { t: Date.now() }), 25000);
    },
    cancel() {
      if (interval) clearInterval(interval);
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
