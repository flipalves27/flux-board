import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, PlanGateError } from "@/lib/plan-gates";

const MAX_AUDIO_BYTES = 24 * 1024 * 1024;
const ALLOWED_EXT = new Set(["mp3", "wav", "webm", "mpeg", "x-m4a", "m4a"]);

function extFromName(name: string): string {
  const m = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id: boardId } = await params;
  if (!boardId || boardId === "boards") {
    return NextResponse.json({ error: "ID do board é obrigatório" }, { status: 400 });
  }

  const org = await getOrganizationById(payload.orgId);
  try {
    assertFeatureAllowed(org, "daily_insights");
  } catch (err) {
    if (err instanceof PlanGateError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) {
    return NextResponse.json({ error: "Sem permissão para este board" }, { status: 403 });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return NextResponse.json(
      { error: "Transcrição indisponível: configure OPENAI_API_KEY no servidor (Whisper)." },
      { status: 503 }
    );
  }

  const rl = await rateLimit({
    key: `boards:transcribe:user:${payload.id}`,
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Muitas transcrições. Tente novamente mais tarde." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Payload inválido (multipart esperado)." }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
    return NextResponse.json({ error: "Arquivo de áudio obrigatório (campo file)." }, { status: 400 });
  }

  const f = file as File;
  const name = f.name || "audio";
  const ext = extFromName(name);
  if (ext && !ALLOWED_EXT.has(ext)) {
    return NextResponse.json(
      { error: `Formato não suportado. Use mp3, wav ou webm (recebido: .${ext}).` },
      { status: 400 }
    );
  }

  const buf = await f.arrayBuffer();
  if (buf.byteLength < 256) {
    return NextResponse.json({ error: "Arquivo de áudio muito curto." }, { status: 400 });
  }
  if (buf.byteLength > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "Arquivo excede 24 MB." }, { status: 400 });
  }

  const blob = new Blob([buf], { type: f.type || "application/octet-stream" });
  const outbound = new FormData();
  outbound.append("file", blob, name);
  outbound.append("model", "whisper-1");
  outbound.append("response_format", "json");

  try {
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
      },
      body: outbound,
    });

    const text = await res.text();
    if (!res.ok) {
      console.error("[transcribe] OpenAI error", res.status, text.slice(0, 400));
      return NextResponse.json(
        { error: `Falha na transcrição (${res.status}).` },
        { status: res.status >= 500 ? 502 : 400 }
      );
    }

    let transcript = "";
    try {
      const data = JSON.parse(text) as { text?: string };
      transcript = String(data.text || "").trim();
    } catch {
      return NextResponse.json({ error: "Resposta inválida do serviço de transcrição." }, { status: 502 });
    }

    if (!transcript) {
      return NextResponse.json({ error: "Transcrição vazia. Tente outro arquivo ou verifique o áudio." }, { status: 422 });
    }

    return NextResponse.json({
      ok: true,
      transcript: transcript.slice(0, 40000),
      fileName: name.slice(0, 200),
      provider: "openai-whisper",
      model: "whisper-1",
    });
  } catch (err) {
    console.error("[transcribe] network", err);
    return NextResponse.json({ error: "Erro de rede ao transcrever." }, { status: 502 });
  }
}
