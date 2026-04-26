import { NextRequest, NextResponse } from "next/server";
import { upsertIntegrationConnection } from "@/lib/kv-integrations";

export const runtime = "nodejs";

/**
 * GitHub redirects here after App installation. Query typically includes installation_id, setup_action, state=orgId.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("state")?.trim();
  const installationId = searchParams.get("installation_id")?.trim();

  if (!orgId) {
    return NextResponse.json({ error: "missing state (orgId)" }, { status: 400 });
  }

  await upsertIntegrationConnection({
    orgId,
    provider: "github",
    status: "connected",
    installationId: installationId ?? null,
    accountLabel: installationId ? `installation:${installationId}` : null,
  });

  const locale = process.env.NEXT_PUBLIC_DEFAULT_LOCALE?.trim() || "pt-BR";
  return NextResponse.redirect(new URL(`/${locale}/forge/onboarding?github=1`, request.url), 302);
}
