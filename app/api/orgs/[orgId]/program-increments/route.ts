import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxForAuth } from "@/lib/plan-gates";
import {
  listProgramIncrements,
  createProgramIncrement,
} from "@/lib/kv-program-increments";
import { z } from "zod";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ orgId: string }> };

const CreatePISchema = z.object({
  name: z.string().trim().min(1).max(200),
  goal: z.string().trim().max(1000).default(""),
  status: z.enum(["planning", "executing", "review", "closed"]).optional().default("planning"),
  startDate: z.string().trim().max(30).nullable().optional().default(null),
  endDate: z.string().trim().max(30).nullable().optional().default(null),
  sprintIds: z.array(z.string().trim().max(200)).optional().default([]),
  boardIds: z.array(z.string().trim().max(200)).optional().default([]),
});

export async function GET(request: NextRequest, { params }: RouteContext) {
  const payload = getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { orgId } = await params;
  if (orgId !== payload.orgId && !payload.isAdmin) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const org = await getOrganizationById(orgId);
  const gateCtx = planGateCtxForAuth(payload.isAdmin);
  try { assertFeatureAllowed(org, "portfolio_sprint", gateCtx); } catch {
    return NextResponse.json({ error: "Disponível em planos Business ou Enterprise." }, { status: 403 });
  }

  const pis = await listProgramIncrements(orgId);
  return NextResponse.json({ programIncrements: pis });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const payload = getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { orgId } = await params;
  if (orgId !== payload.orgId && !payload.isAdmin) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const org = await getOrganizationById(orgId);
  const gateCtxPost = planGateCtxForAuth(payload.isAdmin);
  try { assertFeatureAllowed(org, "portfolio_sprint", gateCtxPost); } catch {
    return NextResponse.json({ error: "Disponível em planos Business ou Enterprise." }, { status: 403 });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const parsed = CreatePISchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", details: parsed.error.flatten() }, { status: 422 });
  }

  const pi = await createProgramIncrement(orgId, parsed.data);
  return NextResponse.json({ programIncrement: pi }, { status: 201 });
}
