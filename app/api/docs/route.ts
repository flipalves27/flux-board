import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { createDoc, listDocsTree, type DocType } from "@/lib/kv-docs";
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

  const boardId = request.nextUrl.searchParams.get("boardId");
  const tree = await listDocsTree(payload.orgId, { relevantBoardId: boardId?.trim() || null });
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
    const c = clean as {
      title: string;
      parentId: string | null;
      contentMd: string;
      tags: string[];
      boardIds?: string[];
      projectId?: string | null;
      docType?: DocType;
      ownerUserId?: string | null;
    };
    const doc = await createDoc({
      orgId: payload.orgId,
      title: String(c.title || ""),
      parentId: c.parentId == null || c.parentId === undefined ? null : String(c.parentId),
      contentMd: String(c.contentMd || ""),
      tags: Array.isArray(c.tags) ? c.tags.map((t) => String(t)) : [],
      boardIds: Array.isArray(c.boardIds) ? c.boardIds.map((b) => String(b)) : undefined,
      projectId: c.projectId == null ? null : String(c.projectId || "").trim() || null,
      docType: c.docType,
      ownerUserId: c.ownerUserId == null ? null : String(c.ownerUserId || "").trim() || null,
    });
    return NextResponse.json({ doc }, { status: 201 });
  } catch (err) {
    return publicApiErrorResponse(err, { context: "api/docs/route.ts" });
  }
}
