import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { updateOrganization } from "@/lib/kv-organizations";

export const runtime = "nodejs";

const REASONS = [
  "too_expensive",
  "missing_features",
  "switching_tool",
  "not_using",
  "other",
] as const;

export async function POST(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!payload.isAdmin) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const reasonRaw = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  const reasonLabel = REASONS.includes(code as (typeof REASONS)[number]) ? code : "other";
  const text = reasonRaw || reasonLabel;

  try {
    await updateOrganization(payload.orgId, {
      billingCancellationFeedback: {
        reason: `${reasonLabel}:${text}`,
        at: new Date().toISOString(),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 400 }
    );
  }
}
