import { NextRequest, NextResponse } from "next/server";
import { getOrganizationByCustomDomain } from "@/lib/kv-organizations";
import type { OrgBranding } from "@/lib/org-branding";
import { resolvePlatformDisplayName } from "@/lib/org-branding";
import { getClientIpFromHeaders, rateLimit } from "@/lib/rate-limit";

/**
 * Branding público por host (white-label em domínio customizado, sem sessão).
 * GET ?host=board.cliente.com ou header Host.
 */
export async function GET(request: NextRequest) {
  const ip = getClientIpFromHeaders(request.headers);
  const rl = await rateLimit({
    key: `branding:public:${ip}`,
    limit: Number(process.env.FLUX_RL_BRANDING_PUBLIC_PER_MIN || 120),
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Muitas requisições. Tente novamente em instantes." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

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
