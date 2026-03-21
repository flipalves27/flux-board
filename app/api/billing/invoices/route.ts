import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { listStripeInvoicesForOrg } from "@/lib/billing";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const payload = getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!payload.isAdmin) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  try {
    const invoices = await listStripeInvoicesForOrg(payload.orgId);
    return NextResponse.json({ invoices });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro interno" },
      { status: 400 }
    );
  }
}
