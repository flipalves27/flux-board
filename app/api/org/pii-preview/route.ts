import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthFromRequest } from "@/lib/auth";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxFromAuthPayload, PlanGateError } from "@/lib/plan-gates";
import { denyPlan } from "@/lib/api-authz";
import { maskPii, piiRiskLevel, scanPii } from "@/lib/pii-scan";
import { zodErrorToMessage } from "@/lib/schemas";

const BodySchema = z.object({
  text: z.string().max(200_000),
});

export async function POST(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const org = await getOrganizationById(payload.orgId);
  const gateCtx = planGateCtxFromAuthPayload(payload);
  try {
    assertFeatureAllowed(org, "portfolio_export", gateCtx);
  } catch (err) {
    if (err instanceof PlanGateError) return denyPlan(err);
    throw err;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
  }

  const findings = scanPii(parsed.data.text);
  const risk = piiRiskLevel(findings);
  const { masked } = maskPii(parsed.data.text);

  return NextResponse.json({
    risk,
    count: findings.length,
    findings: findings.slice(0, 50),
    maskedPreview: masked.slice(0, 12000),
  });
}
