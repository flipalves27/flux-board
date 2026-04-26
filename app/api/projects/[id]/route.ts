import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { archiveProject, getProject, updateProject } from "@/lib/kv-projects";
import { countBoardsInProject } from "@/lib/kv-boards";
import { ProjectUpdateSchema, zodErrorToMessage } from "@/lib/schemas";
import { deriveEffectiveRoles, isOrgConvidado, isPlatformAdmin } from "@/lib/rbac";
import { publicApiErrorResponse } from "@/lib/public-api-error";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const payload = await getAuthFromRequest(_request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  try {
    const { id } = await params;
    const project = await getProject(payload.orgId, id);
    if (!project) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
    const boardCount = await countBoardsInProject(payload.orgId, id);
    return NextResponse.json({ project: { ...project, boardCount } });
  } catch (err) {
    console.error("Project detail API error:", err);
    return publicApiErrorResponse(err, { context: "api/projects/[id]/route.ts" });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  try {
    const roleCtx = deriveEffectiveRoles(payload);
    if (isOrgConvidado(roleCtx) && !isPlatformAdmin(roleCtx)) {
      return NextResponse.json({ error: "Convidados não podem editar projetos." }, { status: 403 });
    }
    const { id } = await params;
    const body = await request.json();
    const parsed = ProjectUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
    }
    const project = await updateProject(payload.orgId, id, parsed.data);
    if (!project) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
    return NextResponse.json({ project });
  } catch (err) {
    console.error("Project detail API error:", err);
    return publicApiErrorResponse(err, { context: "api/projects/[id]/route.ts" });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  try {
    const roleCtx = deriveEffectiveRoles(payload);
    if (isOrgConvidado(roleCtx) && !isPlatformAdmin(roleCtx)) {
      return NextResponse.json({ error: "Convidados não podem arquivar projetos." }, { status: 403 });
    }
    const { id } = await params;
    const res = await archiveProject(payload.orgId, id);
    if (!res.ok) return NextResponse.json({ error: res.reason ?? "Não foi possível arquivar." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Project detail API error:", err);
    return publicApiErrorResponse(err, { context: "api/projects/[id]/route.ts" });
  }
}
