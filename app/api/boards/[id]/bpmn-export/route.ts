import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { bpmnModelFromBoard, bpmnModelToMarkdown, bpmnModelToXml } from "@/lib/bpmn-io";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  const can = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, id);
  if (!can) return NextResponse.json({ error: "Acesso negado ao board." }, { status: 403 });
  const board = await getBoard(id, payload.orgId);
  if (!board) return NextResponse.json({ error: "Board não encontrado." }, { status: 404 });
  const model = bpmnModelFromBoard(board);
  if (!model) return NextResponse.json({ error: "Board não possui modelo BPMN salvo." }, { status: 404 });
  const format = new URL(request.url).searchParams.get("format") === "xml" ? "xml" : "markdown";
  const content = format === "xml" ? bpmnModelToXml(model) : bpmnModelToMarkdown(model);
  return NextResponse.json({ format, content });
}

