import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxFromAuthPayload, PlanGateError } from "@/lib/plan-gates";
import { denyPlan } from "@/lib/api-authz";
import { pickSimilarCardRefs } from "@/lib/smart-card-enrich";

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id: boardId } = await params;
  if (!boardId || boardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }

  const org = await getOrganizationById(payload.orgId);
  const gateCtx = planGateCtxFromAuthPayload(payload);
  try {
    assertFeatureAllowed(org, "ai_card_writer", gateCtx);
  } catch (err) {
    if (err instanceof PlanGateError) return denyPlan(err);
    throw err;
  }

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 });

  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (!openaiKey) {
    return NextResponse.json(
      { error: "Intake multimodal indisponível: configure OPENAI_API_KEY." },
      { status: 503 }
    );
  }

  const rl = await rateLimit({
    key: `boards:intake-vision:${payload.orgId}`,
    limit: 30,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Limite de uso. Tente mais tarde." }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Payload inválido (multipart esperado)." }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
    return NextResponse.json({ error: "Imagem obrigatória (campo file)." }, { status: 400 });
  }

  const f = file as File;
  const mime = (f.type || "application/octet-stream").toLowerCase();
  if (!ALLOWED.has(mime)) {
    return NextResponse.json({ error: "Use PNG, JPEG, WebP ou GIF." }, { status: 400 });
  }

  const buf = await f.arrayBuffer();
  if (buf.byteLength < 256) {
    return NextResponse.json({ error: "Arquivo muito pequeno." }, { status: 400 });
  }
  if (buf.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "Imagem excede 4 MB." }, { status: 400 });
  }

  const b64 = Buffer.from(buf).toString("base64");
  const dataUrl = `data:${mime};base64,${b64}`;

  const model = process.env.OPENAI_VISION_MODEL?.trim() || "gpt-4o-mini";

  const board = await getBoard(boardId, payload.orgId);
  const cards = board?.cards && Array.isArray(board.cards) ? board.cards : [];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 900,
      messages: [
        {
          role: "system",
          content:
            "Você analisa imagens de produto/suporte. Extraia texto em PT-BR: título curto, descrição, possíveis critérios de aceite em bullets. Seja objetivo.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Descreva o que esta imagem sugere como tarefa ou demanda para um backlog Kanban.",
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    console.error("[intake-vision]", res.status, raw.slice(0, 400));
    return NextResponse.json({ error: `Falha na análise (${res.status}).` }, { status: 502 });
  }

  let extracted = "";
  try {
    const data = JSON.parse(raw) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    extracted = String(data.choices?.[0]?.message?.content ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Resposta inválida do serviço de visão." }, { status: 502 });
  }

  if (!extracted) {
    return NextResponse.json({ error: "Não foi possível extrair texto da imagem." }, { status: 422 });
  }

  const titleLine = extracted.split("\n")[0]?.trim() ?? "Demanda";
  const similar = pickSimilarCardRefs(cards, titleLine.slice(0, 200), { limit: 6 });

  return NextResponse.json({
    ok: true,
    extracted,
    suggestedTitle: titleLine.slice(0, 200),
    similarCards: similar,
    model,
  });
}
