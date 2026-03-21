import { NextRequest, NextResponse } from "next/server";
import { getOrganizationByCustomDomain } from "@/lib/kv-organizations";
import type { OrgBranding } from "@/lib/org-branding";
import { resolvePlatformDisplayName } from "@/lib/org-branding";

/**
 * Branding público por host (white-label em domínio customizado, sem sessão).
 * GET ?host=board.cliente.com ou header Host.
 */
export async function GET(request: NextRequest) {
  const qp = request.nextUrl.searchParams.get("host")?.trim().toLowerCase();
  const rawHost =
    qp ||
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host")?.trim() ||
    "";
  const host = rawHost.replace(/:\d+$/, "").toLowerCase();
  if (!host) {
    return NextResponse.json({ error: "host ausente" }, { status: 400 });
  }

  const org = await getOrganizationByCustomDomain(host);
  if (!org) {
    return NextResponse.json({ branding: null }, { status: 404 });
  }

  const b = org.branding ?? {};
  const resolvedName = resolvePlatformDisplayName(b as OrgBranding, org.name);

  return NextResponse.json({
    branding: {
      logoUrl: b.logoUrl,
      primaryColor: b.primaryColor,
      secondaryColor: b.secondaryColor,
      accentColor: b.accentColor,
      platformName: resolvedName,
      faviconUrl: b.faviconUrl,
      customDomainVerified: Boolean(b.customDomainVerifiedAt),
    },
  });
}
