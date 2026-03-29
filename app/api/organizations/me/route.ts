import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import {
  findOtherOrgWithCustomDomain,
  getOrganizationById,
  updateOrganization,
} from "@/lib/kv-organizations";
import { OrgAiSettingsUpdateSchema, OrgBrandingUpdateSchema } from "@/lib/schemas";
import { getEffectiveTier, planGateCtxFromAuthPayload } from "@/lib/plan-gates";
import type { OrgAiSettings, Organization } from "@/lib/kv-organizations";
import {
  orgBrandingAllowsCustomDomain,
  orgBrandingAllowsTheming,
  sanitizeBrandingAssetUrl,
  sanitizeEmailFrom,
  sanitizeHexColor,
  BRANDING_ASSET_MAX_BYTES,
} from "@/lib/org-branding";
import type { OrgBranding } from "@/lib/org-branding";
import {
  allowAdminPlanOverrideFromEnv,
  canAdminOverridePlan,
  planOverrideBlockedByStripe,
  shouldAllowStripeCheckoutForOrg,
} from "@/lib/admin-plan-override";
import { ensureOrgManager } from "@/lib/api-authz";
import { writeSecurityAudit } from "@/lib/security-audit";

export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const org = await getOrganizationById(payload.orgId);
  if (!org) return NextResponse.json({ error: "Organization não encontrada" }, { status: 404 });

  return NextResponse.json({
    organization: {
      _id: org._id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      /** Seletor de plano manual: env `FLUX_ALLOW_ADMIN_PLAN_OVERRIDE` (admin não depende do Stripe). */
      canAdminOverridePlan: canAdminOverridePlan(org),
      /** Mantido para compatibilidade com a UI; sempre false (admin pode alterar plano mesmo com Stripe). */
      planOverrideBlockedByStripe: planOverrideBlockedByStripe(org),
      maxUsers: org.maxUsers,
      maxBoards: org.maxBoards,
      trialEndsAt: org.trialEndsAt ?? null,
      downgradeGraceEndsAt: org.downgradeGraceEndsAt ?? null,
      downgradeFromTier: org.downgradeFromTier ?? null,
      billingNotice: org.billingNotice ?? null,
      createdAt: org.createdAt,
      branding: org.branding ?? null,
      // Billing (Stripe)
      stripeCustomerId: org.stripeCustomerId ?? null,
      stripeSubscriptionId: org.stripeSubscriptionId ?? null,
      stripePriceId: org.stripePriceId ?? null,
      stripeStatus: org.stripeStatus ?? null,
      stripeCurrentPeriodEnd: org.stripeCurrentPeriodEnd ?? null,
      /** Novo checkout só quando não há assinatura ativa; senão usar Portal Stripe. */
      allowStripeCheckout: shouldAllowStripeCheckoutForOrg(org),
      aiSettings: org.aiSettings ?? null,
    },
  });
}

export async function PUT(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : undefined;
  const slug = typeof body?.slug === "string" ? body.slug.trim().slice(0, 80) : undefined;
  const hasBranding = body && typeof body === "object" && "branding" in body;
  const dismissBillingNotice = body?.dismissBillingNotice === true;
  const hasAiSettings = body && typeof body === "object" && "aiSettings" in body;
  const hasPlan = body && typeof body === "object" && "plan" in body && body.plan !== undefined;

  const needsBillingAdmin = dismissBillingNotice || hasPlan;
  const needsOrgManager =
    name !== undefined || slug !== undefined || hasBranding || hasAiSettings;
  if (needsBillingAdmin) {
    const deniedBa = ensureOrgManager(payload);
    if (deniedBa) return deniedBa;
  }
  if (needsOrgManager) {
    const deniedOm = ensureOrgManager(payload);
    if (deniedOm) return deniedOm;
  }
  if (!needsBillingAdmin && !needsOrgManager) {
    return NextResponse.json(
      { error: "Informe `name`, `slug`, `branding`, `aiSettings`, `plan` ou `dismissBillingNotice`." },
      { status: 400 }
    );
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
      if (!orgBrandingAllowsTheming(current, { isOrgAdmin: payload.isAdmin })) {
        return NextResponse.json({ error: "Branding disponível nos planos Pro e Business." }, { status: 403 });
      }
      const b = parsed.data;
      const prev = current.branding ?? {};
      const next: OrgBranding = { ...prev };

      if (b.logoUrl !== undefined) {
        if (b.logoUrl === "" || b.logoUrl === null) {
          next.logoUrl = undefined;
        } else {
          const u = sanitizeBrandingAssetUrl(b.logoUrl, BRANDING_ASSET_MAX_BYTES);
          if (!u) {
            return NextResponse.json({ error: "Logo inválido ou excede 2MB." }, { status: 400 });
          }
          next.logoUrl = u;
        }
      }
      if (b.faviconUrl !== undefined) {
        if (b.faviconUrl === "" || b.faviconUrl === null) {
          next.faviconUrl = undefined;
        } else {
          const u = sanitizeBrandingAssetUrl(b.faviconUrl, BRANDING_ASSET_MAX_BYTES);
          if (!u) {
            return NextResponse.json({ error: "Favicon inválido ou excede 2MB." }, { status: 400 });
          }
          next.faviconUrl = u;
        }
      }
      if (b.primaryColor !== undefined) {
        const c = sanitizeHexColor(b.primaryColor ?? "");
        next.primaryColor = c ?? (b.primaryColor === "" || b.primaryColor === null ? undefined : prev.primaryColor);
      }
      if (b.secondaryColor !== undefined) {
        const c = sanitizeHexColor(b.secondaryColor ?? "");
        next.secondaryColor = c ?? (b.secondaryColor === "" || b.secondaryColor === null ? undefined : prev.secondaryColor);
      }
      if (b.accentColor !== undefined) {
        const c = sanitizeHexColor(b.accentColor ?? "");
        next.accentColor = c ?? (b.accentColor === "" || b.accentColor === null ? undefined : prev.accentColor);
      }
      if (b.platformName !== undefined) {
        const p = typeof b.platformName === "string" ? b.platformName.trim().slice(0, 80) : "";
        next.platformName = p === "" ? undefined : p;
      }
      if (b.emailFrom !== undefined) {
        if (b.emailFrom === "" || b.emailFrom === null) {
          next.emailFrom = undefined;
        } else {
          const e = sanitizeEmailFrom(b.emailFrom);
          if (!e) {
            return NextResponse.json({ error: "E-mail remetente inválido." }, { status: 400 });
          }
          next.emailFrom = e;
        }
      }
      if (b.customDomain !== undefined) {
        if (!orgBrandingAllowsCustomDomain(current, { isOrgAdmin: payload.isAdmin })) {
          return NextResponse.json({ error: "Domínio customizado exige plano Business." }, { status: 403 });
        }
        const d = typeof b.customDomain === "string" ? b.customDomain.trim().toLowerCase() : "";
        const prevD = (prev.customDomain || "").trim().toLowerCase();
        const nextD = d === "" ? undefined : d;
        if (nextD) {
          const taken = await findOtherOrgWithCustomDomain(nextD, current._id);
          if (taken) {
            return NextResponse.json({ error: "Este domínio já está em uso por outra organização." }, { status: 400 });
          }
        }
        next.customDomain = nextD;
        if (nextD !== prevD) {
          next.customDomainVerifiedAt = undefined;
          if (nextD) {
            next.domainVerificationToken = randomBytes(24).toString("hex");
          } else {
            next.domainVerificationToken = undefined;
          }
        }
      }
      if (b.regenerateDomainToken && orgBrandingAllowsCustomDomain(current, { isOrgAdmin: payload.isAdmin }) && next.customDomain) {
        next.domainVerificationToken = randomBytes(24).toString("hex");
        next.customDomainVerifiedAt = undefined;
      }
      brandingPatch = next;
      if (
        brandingPatch &&
        orgBrandingAllowsCustomDomain(current, { isOrgAdmin: payload.isAdmin }) &&
        brandingPatch.customDomain &&
        !brandingPatch.domainVerificationToken
      ) {
        brandingPatch.domainVerificationToken = randomBytes(24).toString("hex");
      }
    }

    let aiSettingsPatch: OrgAiSettings | undefined;
    if (hasAiSettings) {
      const parsed = OrgAiSettingsUpdateSchema.safeParse(body?.aiSettings ?? {});
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten().formErrors.join(" ") }, { status: 400 });
      }
      const tier = getEffectiveTier(current, planGateCtxFromAuthPayload(payload));
      if (tier !== "business" && tier !== "enterprise") {
        return NextResponse.json(
          { error: "Configurações de IA avançadas disponíveis no plano Business." },
          { status: 403 }
        );
      }
      const a = parsed.data;
      const prev = current.aiSettings ?? {};
      const next: OrgAiSettings = { ...prev };
      if (a.anthropicModel !== undefined) {
        next.anthropicModel =
          a.anthropicModel === "" || a.anthropicModel === null ? undefined : a.anthropicModel.trim().slice(0, 120);
      }
      if (a.batchLlmProvider !== undefined) {
        next.batchLlmProvider = a.batchLlmProvider === null ? undefined : a.batchLlmProvider;
      }
      if (a.claudeUserIds !== undefined) {
        next.claudeUserIds =
          a.claudeUserIds === null ? [] : [...new Set(a.claudeUserIds.map((id) => id.trim()).filter(Boolean))].slice(0, 200);
      }
      aiSettingsPatch = next;
    }

    let planPatch: Organization["plan"] | undefined;
    if (hasPlan) {
      if (!allowAdminPlanOverrideFromEnv()) {
        return NextResponse.json(
          { error: "Alteração de plano pelo admin não está habilitada (defina FLUX_ALLOW_ADMIN_PLAN_OVERRIDE=1 no servidor)." },
          { status: 403 }
        );
      }
      const raw = typeof (body as { plan?: unknown }).plan === "string" ? (body as { plan: string }).plan.trim() : "";
      const allowed: Organization["plan"][] = ["free", "trial", "pro", "business", "enterprise"];
      if (!allowed.includes(raw as Organization["plan"])) {
        return NextResponse.json({ error: "Plano inválido. Use: free, trial, pro, business ou enterprise." }, { status: 400 });
      }
      planPatch = raw as Organization["plan"];
      if (planPatch !== current.plan) {
        writeSecurityAudit({
          event: "admin_plan_override",
          actorUserId: payload.id,
          orgId: payload.orgId,
          route: "/api/organizations/me",
          details: {
            fromPlan: current.plan,
            toPlan: planPatch,
            viaEnv: "FLUX_ALLOW_ADMIN_PLAN_OVERRIDE",
          },
        });
      }
    }

    const org = await updateOrganization(payload.orgId, {
      ...(name !== undefined ? { name } : {}),
      ...(slug !== undefined ? { slug } : {}),
      ...(brandingPatch !== undefined ? { branding: brandingPatch } : {}),
      ...(dismissBillingNotice ? { billingNotice: null } : {}),
      ...(aiSettingsPatch !== undefined ? { aiSettings: aiSettingsPatch } : {}),
      ...(planPatch !== undefined ? { plan: planPatch } : {}),
    });
    if (!org) return NextResponse.json({ error: "Organization não encontrada" }, { status: 404 });
    return NextResponse.json({ organization: org });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro interno" }, { status: 400 });
  }
}

