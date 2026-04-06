import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthFromRequest } from "@/lib/auth";
import { ensurePlatformAdmin } from "@/lib/api-authz";
import {
  getOrganizationById,
  updateOrganization,
  type OrganizationPlan,
} from "@/lib/kv-organizations";
import { publicApiErrorResponse } from "@/lib/public-api-error";
import { deleteOrganizationCascade } from "@/lib/org-delete-cascade";
import { zodErrorToMessage } from "@/lib/schemas";
import { insertAuditEvent } from "@/lib/audit-events";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensurePlatformAdmin(payload);
  if (denied) return denied;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  try {
    await deleteOrganizationCascade(id, payload.id);
    await insertAuditEvent({
      action: "organization.deleted_by_platform_admin",
      resourceType: "organization",
      actorUserId: payload.id,
      resourceId: id,
      orgId: id,
      metadata: { cascade: true },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("platform-organizations DELETE:", err);
    const raw = err instanceof Error ? err.message : "";
    if (raw.includes("não encontrada")) {
      return NextResponse.json({ error: "Organização não encontrada." }, { status: 404 });
    }
    if (raw.includes("padrão") || raw.includes("MongoDB")) {
      return NextResponse.json({ error: "Não é possível eliminar esta organização." }, { status: 400 });
    }
    return publicApiErrorResponse(err, { context: "DELETE api/admin/platform-organizations/[id]" });
  }
}

const OrgPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    slug: z.string().trim().min(1).max(60).optional(),
    plan: z.enum(["free", "trial", "pro", "business"]).optional(),
    maxUsers: z.number().int().min(1).max(100_000).optional(),
    maxBoards: z.number().int().min(1).max(1_000_000).optional(),
  })
  .strict();

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await getAuthFromRequest(_request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensurePlatformAdmin(payload);
  if (denied) return denied;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  const org = await getOrganizationById(id);
  if (!org) {
    return NextResponse.json({ error: "Organização não encontrada" }, { status: 404 });
  }
  return NextResponse.json({ organization: org });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensurePlatformAdmin(payload);
  if (denied) return denied;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  try {
    const body = await request.json();
    const parsed = OrgPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
    }
    const patch = parsed.data;
    const updates: Parameters<typeof updateOrganization>[1] = {};
    if (patch.name !== undefined) updates.name = patch.name;
    if (patch.slug !== undefined) updates.slug = patch.slug;
    if (patch.plan !== undefined) updates.plan = patch.plan as OrganizationPlan;
    if (patch.maxUsers !== undefined) updates.maxUsers = patch.maxUsers;
    if (patch.maxBoards !== undefined) updates.maxBoards = patch.maxBoards;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 });
    }

    const org = await updateOrganization(id, updates);
    if (!org) {
      return NextResponse.json({ error: "Organização não encontrada ou MongoDB não configurado" }, { status: 404 });
    }

    await insertAuditEvent({
      action: "organization.updated_by_platform_admin",
      resourceType: "organization",
      actorUserId: payload.id,
      resourceId: id,
      orgId: id,
      metadata: { fields: Object.keys(updates) },
    });

    return NextResponse.json({ organization: org });
  } catch (err) {
    console.error("platform-organizations PATCH:", err);
    return publicApiErrorResponse(err, { context: "api/admin/platform-organizations/[id]/route.ts" });
  }
}
