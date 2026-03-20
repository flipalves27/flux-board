import { NextRequest, NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth";
import { getBoard } from "@/lib/kv-boards";
import { getPortalIndexByToken } from "@/lib/kv-portal";
import { PORTAL_COOKIE_NAME, createPortalSessionToken } from "@/lib/portal-session";
import { getClientIpFromHeaders, rateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const BodySchema = z.object({
  password: z.string().min(1).max(200),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: "Token inválido." }, { status: 400 });
  }

  const ip = getClientIpFromHeaders(request.headers);
  const rl = await rateLimit({ key: `portal:unlock:${token}:${ip}`, limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde um momento." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const index = await getPortalIndexByToken(token);
  if (!index || !index.enabled) {
    return NextResponse.json({ error: "Portal não encontrado." }, { status: 404 });
  }

  const board = await getBoard(index.boardId, index.orgId);
  const portal = board?.portal;
  if (!board || !portal?.enabled || portal.token !== token || !portal.passwordHash) {
    return NextResponse.json({ error: "Portal não encontrado." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Informe a senha." }, { status: 400 });
  }

  const ok = verifyPassword(parsed.data.password, portal.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Senha incorreta." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(PORTAL_COOKIE_NAME, createPortalSessionToken(token), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
