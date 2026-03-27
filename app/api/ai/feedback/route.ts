import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthFromRequest } from "@/lib/auth";
import { insertAiFeedback } from "@/lib/ai-feedback";
import { zodErrorToMessage } from "@/lib/schemas";

const BodySchema = z.object({
  feature: z.string().min(2).max(80),
  vote: z.enum(["up", "down"]),
  targetId: z.string().max(120).optional(),
  boardId: z.string().max(80).optional(),
  meta: z.record(z.string(), z.any()).optional(),
});

export async function POST(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

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

  const res = await insertAiFeedback({
    orgId: payload.orgId,
    userId: payload.id,
    feature: parsed.data.feature,
    vote: parsed.data.vote,
    targetId: parsed.data.targetId,
    boardId: parsed.data.boardId,
    meta: parsed.data.meta,
  });

  return NextResponse.json({ ok: res.ok });
}
