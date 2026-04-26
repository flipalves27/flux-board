import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { deleteDoc } from "@/lib/kv-docs";
import { getOrganizationById } from "@/lib/kv-organizations";
import { DocBulkDeleteSchema, zodErrorToMessage } from "@/lib/schemas";
import { canUseFeature, planGateCtxFromAuthPayload } from "@/lib/plan-gates";

export async function POST(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!payload.isAdmin) {
    return NextResponse.json({ error: "Apenas administradores podem excluir em lote." }, { status: 403 });
  }
  const org = await getOrganizationById(payload.orgId);
  if (!canUseFeature(org, "flux_docs", planGateCtxFromAuthPayload(payload)))
    return NextResponse.json({ error: "Flux Docs indisponível." }, { status: 403 });

  const raw = await request.json().catch(() => ({}));
  const parsed = DocBulkDeleteSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });

  const { docIds } = parsed.data;
  let deleted = 0;
  const missing: string[] = [];
  for (const id of docIds) {
    const ok = await deleteDoc(payload.orgId, id);
    if (ok) deleted += 1;
    else missing.push(id);
  }
  return NextResponse.json({ deleted, missing, requested: docIds.length });
}
