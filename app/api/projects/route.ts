import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ensureAdminUser } from "@/lib/kv-users";
import { createProject, ensureOrgBoardsHaveDefaultProject, listProjects } from "@/lib/kv-projects";
import { ProjectCreateSchema, zodErrorToMessage } from "@/lib/schemas";
import { deriveEffectiveRoles, isOrgConvidado, isPlatformAdmin } from "@/lib/rbac";
import { publicApiErrorResponse } from "@/lib/public-api-error";

export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  try {
    const includeArchived = request.nextUrl.searchParams.get("includeArchived") === "1";
    const migration = await ensureOrgBoardsHaveDefaultProject(payload.orgId);
    const projects = await listProjects(payload.orgId, { includeArchived });
    return NextResponse.json({
      projects,
      migration: {
        defaultProjectId: migration.project.id,
        matched: migration.matched,
        modified: migration.modified,
      },
    });
  } catch (err) {
    console.error("Projects API error:", err);
    return publicApiErrorResponse(err, { context: "api/projects/route.ts" });
  }
}

export async function POST(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  try {
    await ensureAdminUser();
    const roleCtx = deriveEffectiveRoles(payload);
    if (isOrgConvidado(roleCtx) && !isPlatformAdmin(roleCtx)) {
      return NextResponse.json({ error: "Convidados não podem criar projetos." }, { status: 403 });
    }

    const body = await request.json();
    const parsed = ProjectCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
    }

    await ensureOrgBoardsHaveDefaultProject(payload.orgId);
    const project = await createProject(payload.orgId, parsed.data);
    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    console.error("Projects API error:", err);
    return publicApiErrorResponse(err, { context: "api/projects/route.ts" });
  }
}
