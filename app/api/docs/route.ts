import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { createDoc, listDocsTree } from "@/lib/kv-docs";
import { DocCreateSchema, sanitizeDeep, zodErrorToMessage } from "@/lib/schemas";
import { getOrganizationById } from "@/lib/kv-organizations";
import { canUseFeature, planGateCtxFromAuthPayload } from "@/lib/plan-gates";
import { publicApiErrorResponse } from "@/lib/public-api-error";

export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const org = await getOrganizationById(payload.orgId);
  const gateCtx = planGateCtxFromAuthPayload(payload);
  if (!canUseFeature(org, "flux_docs", gateCtx)) {
    return NextResponse.json({ error: "Flux Docs indisponível no plano atual." }, { status: 403 });
  }

  const tree = await listDocsTree(payload.orgId);
  return NextResponse.json({ docs: tree });
}

export async function POST(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const org = await getOrganizationById(payload.orgId);
  const gateCtxPost = planGateCtxFromAuthPayload(payload);
  if (!canUseFeature(org, "flux_docs", gateCtxPost)) {
    return NextResponse.json({ error: "Flux Docs indisponível no plano atual." }, { status: 403 });
  }

  try {
    const parsed = DocCreateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
    const clean = sanitizeDeep(parsed.data);
    const doc = await createDoc({
      orgId: payload.orgId,
      title: String(clean.title || ""),
      parentId: clean.parentId == null ? null : String(clean.parentId),
      contentMd: String(clean.contentMd || ""),
      tags: Array.isArray(clean.tags) ? clean.tags.map((t) => String(t)) : [],
    });
    return NextResponse.json({ doc }, { status: 201 });
  } catch (err) {
    return publicApiErrorResponse(err, { context: "api/docs/route.ts" });
  }
}
