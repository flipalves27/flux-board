import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { markdownToBpmnModel, xmlToBpmnModel } from "@/lib/bpmn-io";
import { validateBpmnModel } from "@/lib/bpmn-types";
import { publicApiErrorResponse } from "@/lib/public-api-error";

export async function POST(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const format = body?.format === "xml" ? "xml" : "markdown";
  const input = typeof body?.input === "string" ? body.input : "";
  if (!input.trim()) return NextResponse.json({ error: "Conteúdo BPMN vazio." }, { status: 400 });
  try {
    const model = format === "xml" ? xmlToBpmnModel(input) : markdownToBpmnModel(input);
    const validation = validateBpmnModel(model);
    return NextResponse.json({ model, validation });
  } catch (e) {
    return publicApiErrorResponse(e, { context: "api/bpmn/convert/route.ts", status: 400, fallbackMessage: "Falha ao converter BPMN." });
  }
}

