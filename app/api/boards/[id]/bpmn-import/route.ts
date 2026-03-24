import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, updateBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { attachBpmnModelToMapa, markdownToBpmnModel, xmlToBpmnModel } from "@/lib/bpmn-io";
import { validateBpmnModel } from "@/lib/bpmn-types";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  const can = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, id);
  if (!can) return NextResponse.json({ error: "Acesso negado ao board." }, { status: 403 });
  const board = await getBoard(id, payload.orgId);
  if (!board) return NextResponse.json({ error: "Board não encontrado." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const format = body?.format === "xml" ? "xml" : "markdown";
  const content = typeof body?.content === "string" ? body.content : "";
  if (!content.trim()) return NextResponse.json({ error: "Conteúdo BPMN vazio." }, { status: 400 });
  const model = format === "xml" ? xmlToBpmnModel(content) : markdownToBpmnModel(content);
  const validation = validateBpmnModel(model);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.issues.find((i) => i.severity === "error")?.message ?? "Modelo BPMN inválido.", issues: validation.issues }, { status: 400 });
  }
  const cards = model.nodes.map((n, i) => ({
    id: `bpmn_${Date.now()}_${i}`,
    bucket: "bpmn_canvas",
    priority: "Média",
    progress: "Não iniciado",
    title: n.label,
    desc: `BPMN ${n.type}`,
    tags: ["BPMN"],
    order: i,
    blockedBy: [],
  }));
  const next = await updateBoard(id, payload.orgId, {
    cards,
    config: {
      bucketOrder: [{ key: "bpmn_canvas", label: "BPMN Canvas", color: "var(--flux-primary)" }],
      collapsedColumns: [],
      labels: ["BPMN"],
    },
    mapaProducao: attachBpmnModelToMapa(model, board.mapaProducao),
  });
  if (!next) return NextResponse.json({ error: "Falha ao atualizar board." }, { status: 500 });
  return NextResponse.json({ ok: true, nodes: model.nodes.length, edges: model.edges.length, issues: validation.issues });
}

