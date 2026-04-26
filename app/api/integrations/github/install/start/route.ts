import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ensureOrgManager } from "@/lib/api-authz";

export const runtime = "nodejs";

/**
 * Redirects to GitHub App installation (configure FLUX_GITHUB_APP_SLUG or FLUX_GITHUB_APP_INSTALL_URL).
 */
export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensureOrgManager(payload);
  if (denied) return denied;

  const full = process.env.FLUX_GITHUB_APP_INSTALL_URL?.trim();
  if (full) {
    const u = new URL(full);
    u.searchParams.set("state", payload.orgId);
    return NextResponse.redirect(u.toString(), 302);
  }

  const slug = process.env.FLUX_GITHUB_APP_SLUG?.trim();
  if (!slug) {
    return NextResponse.json(
      { error: "GitHub App não configurada (FLUX_GITHUB_APP_SLUG ou FLUX_GITHUB_APP_INSTALL_URL)." },
      { status: 501 }
    );
  }

  const install = new URL(`https://github.com/apps/${encodeURIComponent(slug)}/installations/new`);
  install.searchParams.set("state", payload.orgId);
  return NextResponse.redirect(install.toString(), 302);
}
