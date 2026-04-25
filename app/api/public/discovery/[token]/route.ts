import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getDiscoverySessionByTokenHash,
  hashDiscoveryToken,
  updateDiscoverySession,
  type DiscoveryFormField,
} from "@/lib/kv-discovery-sessions";
import { getClientIpFromHeaders, rateLimit } from "@/lib/rate-limit";
import { sanitizeDeep } from "@/lib/schemas";
import { publicApiErrorResponse } from "@/lib/public-api-error";

function collectFields(session: { formDefinition: { blocks: { fields: DiscoveryFormField[] }[] } }): DiscoveryFormField[] {
  return session.formDefinition.blocks.flatMap((b) => b.fields);
}

function isExpired(expiresAt: string): boolean {
  const t = new Date(expiresAt).getTime();
  return !Number.isFinite(t) || t < Date.now();
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = await params;
  const plainToken = decodeURIComponent(String(rawToken || "").trim());
  if (plainToken.length < 16) {
    return NextResponse.json({ error: "Token inválido." }, { status: 400 });
  }

  const ip = getClientIpFromHeaders(request.headers);
  const rlIp = await rateLimit({ key: `discovery:public:get:ip:${ip}`, limit: 40, windowMs: 60_000 });
  if (!rlIp.allowed) {
    return NextResponse.json(
      { error: "Muitas requisições. Tente novamente em instantes." },
      { status: 429, headers: { "Retry-After": String(rlIp.retryAfterSeconds) } }
    );
  }

  const tokenHash = hashDiscoveryToken(plainToken);
  const rlTok = await rateLimit({ key: `discovery:public:get:tok:${tokenHash.slice(0, 24)}`, limit: 120, windowMs: 60_000 });
  if (!rlTok.allowed) {
    return NextResponse.json(
      { error: "Muitas requisições para este link." },
      { status: 429, headers: { "Retry-After": String(rlTok.retryAfterSeconds) } }
    );
  }

  const session = await getDiscoverySessionByTokenHash(tokenHash);
  if (!session) return NextResponse.json({ error: "Sessão não encontrada." }, { status: 404 });
  if (session.status === "archived") return NextResponse.json({ error: "Sessão encerrada." }, { status: 404 });
  if (isExpired(session.expiresAt)) {
    return NextResponse.json({ error: "Este link expirou." }, { status: 410 });
  }

  const fields = collectFields(session);
  return NextResponse.json({
    status: session.status,
    boardTitle: session.boardTitleSnapshot,
    expiresAt: session.expiresAt,
    form: {
      blocks: session.formDefinition.blocks.map((b) => ({
        id: b.id,
        title: b.title,
        fields: b.fields.map((f) => ({
          id: f.id,
          label: f.label,
          type: f.type,
          maxLength: f.maxLength,
          placeholder: f.placeholder ?? null,
        })),
      })),
    },
    fieldIds: fields.map((f) => f.id),
  });
}

const SubmitBodySchema = z.object({
  responses: z.record(z.string(), z.string()).superRefine((rec, ctx) => {
    let total = 0;
    for (const v of Object.values(rec)) {
      total += String(v).length;
    }
    if (total > 80_000) {
      ctx.addIssue({ code: "custom", message: "Conteúdo demasiado longo." });
    }
  }),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = await params;
  const plainToken = decodeURIComponent(String(rawToken || "").trim());
  if (plainToken.length < 16) {
    return NextResponse.json({ error: "Token inválido." }, { status: 400 });
  }

  const ip = getClientIpFromHeaders(request.headers);
  const rlIp = await rateLimit({ key: `discovery:public:post:ip:${ip}`, limit: 20, windowMs: 60_000 });
  if (!rlIp.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Tente novamente em instantes." },
      { status: 429, headers: { "Retry-After": String(rlIp.retryAfterSeconds) } }
    );
  }

  const tokenHash = hashDiscoveryToken(plainToken);
  const rlTok = await rateLimit({ key: `discovery:public:post:tok:${tokenHash.slice(0, 24)}`, limit: 8, windowMs: 60_000 });
  if (!rlTok.allowed) {
    return NextResponse.json(
      { error: "Muitas submissões para este link." },
      { status: 429, headers: { "Retry-After": String(rlTok.retryAfterSeconds) } }
    );
  }

  const session = await getDiscoverySessionByTokenHash(tokenHash);
  if (!session) return NextResponse.json({ error: "Sessão não encontrada." }, { status: 404 });
  if (session.status === "archived") return NextResponse.json({ error: "Sessão encerrada." }, { status: 404 });
  if (isExpired(session.expiresAt)) {
    return NextResponse.json({ error: "Este link expirou." }, { status: 410 });
  }
  if (session.status !== "open") {
    return NextResponse.json({ error: "Este formulário já foi submetido." }, { status: 409 });
  }

  try {
    const json = await request.json().catch(() => null);
    const parsed = SubmitBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Pedido inválido.", details: parsed.error.flatten() }, { status: 400 });
    }

    const fields = collectFields(session);
    const allowed = new Set(fields.map((f) => f.id));
    const maxById = new Map(fields.map((f) => [f.id, f.maxLength] as const));

    const raw = sanitizeDeep(parsed.data.responses) as Record<string, string>;
    const cleaned: Record<string, string> = {};

    for (const id of allowed) {
      const v = raw[id];
      const max = maxById.get(id) ?? 4000;
      cleaned[id] = String(v ?? "")
        .trim()
        .slice(0, max);
    }

    for (const k of Object.keys(raw)) {
      if (!allowed.has(k)) {
        return NextResponse.json({ error: `Campo desconhecido: ${k}` }, { status: 400 });
      }
    }

    const nonEmpty = Object.values(cleaned).some((s) => s.length > 0);
    if (!nonEmpty) {
      return NextResponse.json({ error: "Preencha pelo menos um campo." }, { status: 400 });
    }

    const now = new Date().toISOString();
    await updateDiscoverySession(session.orgId, session.boardId, session.id, {
      status: "submitted",
      responses: cleaned,
      responsesSubmittedAt: now,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return publicApiErrorResponse(err, { context: "POST public/discovery" });
  }
}
