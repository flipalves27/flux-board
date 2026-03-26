import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxForAuth } from "@/lib/plan-gates";
import {
  getProgramIncrement,
  updateProgramIncrement,
  deleteProgramIncrement,
} from "@/lib/kv-program-increments";
import { z } from "zod";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ orgId: string; piId: string }> };

const UpdatePISchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  goal: z.string().trim().max(1000).optional(),
  status: z.enum(["planning", "executing", "review", "closed"]).optional(),
  startDate: z.string().trim().max(30).nullable().optional(),
  endDate: z.string().trim().max(30).nullable().optional(),
  sprintIds: z.array(z.string().trim().max(200)).optional(),
  boardIds: z.array(z.string().trim().max(200)).optional(),
});

async function checkAccess(request: NextRequest, orgId: string) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return { error: "Não autenticado", status: 401 as const, payload: null };
  if (orgId !== payload.orgId && !payload.isAdmin) {
    return { error: "Sem permissão", status: 403 as const, payload: null };
  }
  const org = await getOrganizationById(orgId);
  const gateCtx = planGateCtxForAuth(payload.isAdmin, payload.isExecutive);
  try { assertFeatureAllowed(org, "portfolio_sprint", gateCtx); } catch {
    return { error: "Disponível em planos Business ou Enterprise.", status: 403 as const, payload: null };
  }
  return { error: null, status: 200 as const, payload };
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { orgId, piId } = await params;
  const access = await checkAccess(request, orgId);
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const pi = await getProgramIncrement(orgId, piId);
  if (!pi) return NextResponse.json({ error: "Program Increment não encontrado" }, { status: 404 });
  return NextResponse.json({ programIncrement: pi });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { orgId, piId } = await params;
  const access = await checkAccess(request, orgId);
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const parsed = UpdatePISchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 422 });
  }

  const updated = await updateProgramIncrement(orgId, piId, parsed.data);
  if (!updated) return NextResponse.json({ error: "Program Increment não encontrado" }, { status: 404 });
  return NextResponse.json({ programIncrement: updated });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { orgId, piId } = await params;
  const access = await checkAccess(request, orgId);
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });

  const deleted = await deleteProgramIncrement(orgId, piId);
  if (!deleted) return NextResponse.json({ error: "Program Increment não encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
