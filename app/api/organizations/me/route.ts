import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getOrganizationById, updateOrganization } from "@/lib/kv-organizations";
import { OrgBrandingUpdateSchema } from "@/lib/schemas";
import { orgBrandingAllowsCustomDomain, orgBrandingAllowsTheming, sanitizeHexColor } from "@/lib/org-branding";
import type { OrgBranding } from "@/lib/org-branding";

export async function GET(request: NextRequest) {
  const payload = getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const org = await getOrganizationById(payload.orgId);
  if (!org) return NextResponse.json({ error: "Organization não encontrada" }, { status: 404 });

  return NextResponse.json({
    organization: {
      _id: org._id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      maxUsers: org.maxUsers,
      maxBoards: org.maxBoards,
      createdAt: org.createdAt,
      branding: org.branding ?? null,
      // Billing (Stripe)
      stripeCustomerId: org.stripeCustomerId ?? null,
      stripeSubscriptionId: org.stripeSubscriptionId ?? null,
      stripePriceId: org.stripePriceId ?? null,
      stripeStatus: org.stripeStatus ?? null,
      stripeCurrentPeriodEnd: org.stripeCurrentPeriodEnd ?? null,
    },
  });
}

export async function PUT(request: NextRequest) {
  const payload = getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!payload.isAdmin) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : undefined;
  const slug = typeof body?.slug === "string" ? body.slug.trim().slice(0, 80) : undefined;
  const hasBranding = body && typeof body === "object" && "branding" in body;

  if (!name && !slug && !hasBranding) {
    return NextResponse.json({ error: "Informe `name`, `slug` ou `branding`." }, { status: 400 });
  }

  try {
    const current = await getOrganizationById(payload.orgId);
    if (!current) return NextResponse.json({ error: "Organization não encontrada" }, { status: 404 });

    let brandingPatch: OrgBranding | undefined;
    if (hasBranding) {
      const parsed = OrgBrandingUpdateSchema.safeParse(body?.branding ?? {});
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten().formErrors.join(" ") }, { status: 400 });
      }
      if (!orgBrandingAllowsTheming(current)) {
        return NextResponse.json({ error: "Branding disponível nos planos Pro e Business." }, { status: 403 });
      }
      const b = parsed.data;
      const prev = current.branding ?? {};
      const next: OrgBranding = { ...prev };
      if (b.logoUrl !== undefined) next.logoUrl = b.logoUrl === "" ? undefined : b.logoUrl ?? undefined;
      if (b.faviconUrl !== undefined) next.faviconUrl = b.faviconUrl === "" ? undefined : b.faviconUrl ?? undefined;
      if (b.primaryColor !== undefined) {
        const c = sanitizeHexColor(b.primaryColor ?? "");
        next.primaryColor = c ?? (b.primaryColor === "" || b.primaryColor === null ? undefined : prev.primaryColor);
      }
      if (b.secondaryColor !== undefined) {
        const c = sanitizeHexColor(b.secondaryColor ?? "");
        next.secondaryColor = c ?? (b.secondaryColor === "" || b.secondaryColor === null ? undefined : prev.secondaryColor);
      }
      if (b.customDomain !== undefined) {
        if (!orgBrandingAllowsCustomDomain(current)) {
          return NextResponse.json({ error: "Domínio customizado exige plano Business." }, { status: 403 });
        }
        const d = typeof b.customDomain === "string" ? b.customDomain.trim().toLowerCase() : "";
        next.customDomain = d === "" ? undefined : d;
      }
      brandingPatch = next;
    }

    const org = await updateOrganization(payload.orgId, {
      ...(name !== undefined ? { name } : {}),
      ...(slug !== undefined ? { slug } : {}),
      ...(brandingPatch !== undefined ? { branding: brandingPatch } : {}),
    });
    if (!org) return NextResponse.json({ error: "Organization não encontrada" }, { status: 404 });
    return NextResponse.json({ organization: org });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro interno" }, { status: 400 });
  }
}

