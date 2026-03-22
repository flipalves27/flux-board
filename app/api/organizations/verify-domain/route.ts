import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getOrganizationById, updateOrganization } from "@/lib/kv-organizations";
import { orgBrandingAllowsCustomDomain } from "@/lib/org-branding";
import { verifyFluxTxtRecord } from "@/lib/org-domain-dns";

/** POST — admin confirma registro TXT no DNS para o domínio configurado. */
export async function POST(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!payload.isAdmin) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const org = await getOrganizationById(payload.orgId);
  if (!org) return NextResponse.json({ error: "Organization não encontrada" }, { status: 404 });
  if (!orgBrandingAllowsCustomDomain(org)) {
    return NextResponse.json({ error: "Domínio customizado exige plano Business." }, { status: 403 });
  }

  const host = org.branding?.customDomain?.trim().toLowerCase();
  const token = org.branding?.domainVerificationToken?.trim();
  if (!host || !token) {
    return NextResponse.json({ error: "Configure um domínio e aguarde o token de verificação." }, { status: 400 });
  }

  const ok = await verifyFluxTxtRecord(host, token);
  if (!ok) {
    return NextResponse.json(
      { ok: false, error: "Registro TXT não encontrado ou valor incorreto. Propague o DNS e tente novamente." },
      { status: 400 }
    );
  }

  const verifiedAt = new Date().toISOString();
  const nextBranding = {
    ...(org.branding ?? {}),
    customDomainVerifiedAt: verifiedAt,
  };

  const updated = await updateOrganization(org._id, { branding: nextBranding });
  if (!updated) return NextResponse.json({ error: "Falha ao atualizar." }, { status: 500 });

  return NextResponse.json({ ok: true, customDomainVerifiedAt: verifiedAt, organization: updated });
}
