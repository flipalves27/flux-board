import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { aiDraftToSnapshot, generateTemplateDraftWithTogether } from "@/lib/template-ai";

export async function POST(request: NextRequest) {
  const payload = getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  if (description.length < 10) {
    return NextResponse.json({ error: "Descreva o time com pelo menos 10 caracteres." }, { status: 400 });
  }

  const gen = await generateTemplateDraftWithTogether(description);
  if (!gen.ok || !gen.draft) {
    return NextResponse.json({ error: gen.error || "Falha ao gerar template." }, { status: 400 });
  }

  const snapshot = aiDraftToSnapshot(gen.draft);
  return NextResponse.json({
    draft: gen.draft,
    snapshot,
    automationIdeas: gen.draft.automationIdeas,
  });
}
