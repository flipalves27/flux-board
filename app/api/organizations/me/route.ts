import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import {
  findOtherOrgWithCustomDomain,
  getOrganizationById,
  updateOrganization,
} from "@/lib/kv-organizations";
import { publicApiErrorResponse } from "@/lib/public-api-error";
import { OrgAiSettingsUpdateSchema, OrgBrandingUpdateSchema, OrgUiSettingsUpdateSchema } from "@/lib/schemas";
import type { OrgAiSettings, Organization } from "@/lib/kv-organizations";
import { decryptOrgAiSecrets, encryptOrgAiSecrets, getOrgAiSecretsMasterKey } from "@/lib/org-ai-secrets-crypto";
import { organizationForApiClient } from "@/lib/org-api-response";
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
import { canManageOrganization, deriveEffectiveRoles, isPlatformAdminFromAuthPayload } from "@/lib/rbac";
import { insertAuditEvent } from "@/lib/audit-events";

export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const org = await getOrganizationById(payload.orgId);
  if (!org) return NextResponse.json({ error: "Organization não encontrada" }, { status: 404 });

  const base = organizationForApiClient(org);
  return NextResponse.json({
    organization: {
      ...base,
      /** Override manual: só administrador da plataforma + env `FLUX_ALLOW_ADMIN_PLAN_OVERRIDE`. */
      canAdminOverridePlan: canAdminOverridePlan(org) && isPlatformAdminFromAuthPayload(payload),
      /** Só relevante para quem pode override manual (admin da plataforma). */
      planOverrideBlockedByStripe:
        planOverrideBlockedByStripe(org) && isPlatformAdminFromAuthPayload(payload),
      /** Novo checkout só quando não há assinatura ativa; senão usar Portal Stripe. */
      allowStripeCheckout: shouldAllowStripeCheckoutForOrg(org),
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
  const hasUi = body && typeof body === "object" && "ui" in body;
  const hasPlan = body && typeof body === "object" && "plan" in body && body.plan !== undefined;

  const needsBillingAdmin = dismissBillingNotice || hasPlan;
  const needsOrgManager =
    name !== undefined || slug !== undefined || hasBranding || hasAiSettings || hasUi;
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
      { error: "Informe `name`, `slug`, `branding`, `aiSettings`, `ui`, `plan` ou `dismissBillingNotice`." },
      { status: 400 }
    );
  }

  try {
    const current = await getOrganizationById(payload.orgId);
    if (!current) return NextResponse.json({ error: "Organization não encontrada" }, { status: 404 });

    const isOrgAdminForBranding = canManageOrganization(deriveEffectiveRoles(payload));

    let brandingPatch: OrgBranding | undefined;
    if (hasBranding) {
      const parsed = OrgBrandingUpdateSchema.safeParse(body?.branding ?? {});
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten().formErrors.join(" ") }, { status: 400 });
      }
      if (!orgBrandingAllowsTheming(current, { isOrgAdmin: isOrgAdminForBranding })) {
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
        if (!orgBrandingAllowsCustomDomain(current, { isOrgAdmin: isOrgAdminForBranding })) {
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
      if (b.regenerateDomainToken && orgBrandingAllowsCustomDomain(current, { isOrgAdmin: isOrgAdminForBranding }) && next.customDomain) {
        next.domainVerificationToken = randomBytes(24).toString("hex");
        next.customDomainVerifiedAt = undefined;
      }
      brandingPatch = next;
      if (
        brandingPatch &&
        orgBrandingAllowsCustomDomain(current, { isOrgAdmin: isOrgAdminForBranding }) &&
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
      const a = parsed.data;
      const prev = current.aiSettings;
      const master = getOrgAiSecretsMasterKey();
      const next: OrgAiSettings = {};
      if (prev?.togetherModel) next.togetherModel = prev.togetherModel;
      if (prev?.aiSecretsEnc) next.aiSecretsEnc = prev.aiSecretsEnc;

      if (a.togetherModel !== undefined) {
        if (a.togetherModel === null || a.togetherModel === "") delete next.togetherModel;
        else next.togetherModel = a.togetherModel.trim().slice(0, 160);
      }

      if (a.removeTogetherSecrets) {
        delete next.aiSecretsEnc;
      } else {
        const wantsSecretWrite =
          (typeof a.togetherApiKey === "string" && a.togetherApiKey.trim() !== "") || a.togetherBaseUrl !== undefined;
        if (wantsSecretWrite) {
          let bag: { togetherApiKey?: string; togetherBaseUrl?: string } = {};
          if (prev?.aiSecretsEnc && master) {
            const d = decryptOrgAiSecrets(prev.aiSecretsEnc, master);
            if (d) bag = { ...d };
          }
          const nk = typeof a.togetherApiKey === "string" ? a.togetherApiKey.trim() : "";
          if (nk) bag.togetherApiKey = nk;
          if (a.togetherBaseUrl !== undefined) {
            if (a.togetherBaseUrl === null || a.togetherBaseUrl === "") delete bag.togetherBaseUrl;
            else bag.togetherBaseUrl = a.togetherBaseUrl.trim();
          }
          const hasAny = Boolean(bag.togetherApiKey || bag.togetherBaseUrl);
          if (hasAny) {
            if (!master) {
              return NextResponse.json(
                {
                  error:
                    "Defina FLUX_AI_SECRETS_KEY no servidor (mín. 16 caracteres) para guardar a chave ou URL da API com segurança.",
                },
                { status: 400 }
              );
            }
            next.aiSecretsEnc = encryptOrgAiSecrets(bag, master);
          } else if (prev?.aiSecretsEnc) {
            next.aiSecretsEnc = prev.aiSecretsEnc;
          }
        }
      }
      aiSettingsPatch = next;
    }

    let uiPatch: Organization["ui"] | undefined;
    if (hasUi) {
      const parsed = OrgUiSettingsUpdateSchema.safeParse((body as { ui?: unknown }).ui ?? {});
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten().formErrors.join(" ") }, { status: 400 });
      }
      const prevUi = current.ui ?? {};
      const prevOnda = prevUi.onda4 ?? {};
      const nextOnda = { ...prevOnda };
      const o = parsed.data.onda4;
      if (o) {
        if (o.enabled !== undefined) nextOnda.enabled = o.enabled;
        if (o.omnibar !== undefined) nextOnda.omnibar = o.omnibar;
        if (o.dailyBriefing !== undefined) nextOnda.dailyBriefing = o.dailyBriefing;
        if (o.anomalyToasts !== undefined) nextOnda.anomalyToasts = o.anomalyToasts;
      }
      uiPatch = { ...prevUi, onda4: Object.keys(nextOnda).length ? nextOnda : prevOnda };
    }

    let planPatch: Organization["plan"] | undefined;
    if (hasPlan) {
      if (!allowAdminPlanOverrideFromEnv()) {
        return NextResponse.json(
          { error: "Alteração de plano pelo admin não está habilitada (defina FLUX_ALLOW_ADMIN_PLAN_OVERRIDE=1 no servidor)." },
          { status: 403 }
        );
      }
      if (!isPlatformAdminFromAuthPayload(payload)) {
        return NextResponse.json(
          { error: "Apenas administrador da plataforma pode alterar o plano manualmente." },
          { status: 403 }
        );
      }
      const raw = typeof (body as { plan?: unknown }).plan === "string" ? (body as { plan: string }).plan.trim() : "";
      const allowed: Organization["plan"][] = ["free", "trial", "pro", "business"];
      if (!allowed.includes(raw as Organization["plan"])) {
        return NextResponse.json({ error: "Plano inválido. Use: free, trial, pro ou business." }, { status: 400 });
      }
      planPatch = raw as Organization["plan"];
      if (planPatch !== current.plan) {
        await insertAuditEvent({
          action: "admin_plan_override",
          resourceType: "organization",
          actorUserId: payload.id,
          resourceId: payload.orgId,
          orgId: payload.orgId,
          route: "/api/organizations/me",
          metadata: {
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
      ...(uiPatch !== undefined ? { ui: uiPatch } : {}),
      ...(planPatch !== undefined ? { plan: planPatch } : {}),
    });
    if (!org) return NextResponse.json({ error: "Organization não encontrada" }, { status: 404 });
    const pub = organizationForApiClient(org);
    return NextResponse.json({
      organization: {
        ...pub,
        canAdminOverridePlan: canAdminOverridePlan(org) && isPlatformAdminFromAuthPayload(payload),
        planOverrideBlockedByStripe:
          planOverrideBlockedByStripe(org) && isPlatformAdminFromAuthPayload(payload),
        allowStripeCheckout: shouldAllowStripeCheckoutForOrg(org),
      },
    });
  } catch (err) {
    return publicApiErrorResponse(err, { context: "api/organizations/me/route.ts", status: 400, fallbackMessage: "Pedido inválido. Tente novamente." });
  }
}

