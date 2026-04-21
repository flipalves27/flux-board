import { NextRequest, NextResponse } from "next/server";
import { getBriefPortalToken } from "@/lib/brief-portal-token";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Token obrigatório" }, { status: 400 });

  const rl = await rateLimit({
    key: `public-brief:${token.slice(0, 12)}`,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Muitas requisições" }, { status: 429 });

  const doc = await getBriefPortalToken(token);
  if (!doc) return NextResponse.json({ error: "Não encontrado ou expirado" }, { status: 404 });

  return NextResponse.json({
    title: doc.title,
    markdown: doc.markdown,
    boardId: doc.boardId,
    expiresAt: doc.expiresAt instanceof Date ? doc.expiresAt.toISOString() : String(doc.expiresAt),
  });
}
