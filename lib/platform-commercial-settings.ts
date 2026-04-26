import { unstable_cache } from "next/cache";
import type Stripe from "stripe";
import { PRICING_BRL, brlCentsEqual, roundBrl2 } from "./billing-pricing";
import { getDb, isMongoConfigured } from "./mongo";

export const COMMERCIAL_SETTINGS_CACHE_TAG = "platform-commercial-settings";

const COL = "platform_commercial_settings";
const DOC_ID = "default" as const;

export type CommercialDisplayPricing = {
  proSeatMonth: number;
  proSeatYear: number;
  businessSeatMonth: number;
  businessSeatYear: number;
};

export type PlatformCommercialDoc = {
  _id: typeof DOC_ID;
  proEnabled?: boolean;
  businessEnabled?: boolean;
  proSeatMonth?: number;
  proSeatYear?: number;
  businessSeatMonth?: number;
  businessSeatYear?: number;
  stripePriceIdPro?: string | null;
  stripePriceIdBusiness?: string | null;
  stripePriceIdProAnnual?: string | null;
  stripePriceIdBusinessAnnual?: string | null;
  legacyProPriceIds?: string[];
  legacyBusinessPriceIds?: string[];
  stripeProductIdPro?: string | null;
  stripeProductIdBusiness?: string | null;
  updatedAt?: string;
};

export type PublicCommercialCatalog = {
  pricing: CommercialDisplayPricing;
  proEnabled: boolean;
  businessEnabled: boolean;
};

/**
 * Normaliza valor colado no Vercel/.env (aspas extras, BOM, espaços).
 * Não altera o conteúdo de um price_ válido.
 */
export function normalizeStripePriceIdInput(value: string | null | undefined): string {
  if (value == null) return "";
  let s = String(value).replace(/^\uFEFF/, "").trim();
  for (;;) {
    const wrapped =
      (s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"));
    if (!wrapped || s.length < 2) break;
    s = s.slice(1, -1).replace(/^\uFEFF/, "").trim();
  }
  return s;
}

/** Stripe Price id no Dashboard/API (ex.: price_1N2abc...). Rejeita valores em reais colados por engano (ex.: 19,99). */
export function isValidStripePriceId(value: string | null | undefined): boolean {
  const s = normalizeStripePriceIdInput(value);
  if (!s) return false;
  return /^price_[A-Za-z0-9_-]+$/.test(s);
}

function isStripeProductId(value: string): boolean {
  return /^prod_[A-Za-z0-9_-]+$/.test(normalizeStripePriceIdInput(value));
}

function pickEffectivePriceId(
  docField: string | null | undefined,
  envField: string,
  fieldLabel: string
): string {
  const fromDoc = normalizeStripePriceIdInput(docField);
  if (fromDoc && isValidStripePriceId(fromDoc)) return fromDoc;
  if (fromDoc && !isValidStripePriceId(fromDoc)) {
    if (isStripeProductId(fromDoc)) {
      console.warn(
        `[platform-commercial] Ignorando ${fieldLabel}: valor no MongoDB parece ID de Produto (prod_…), não Price ID (price_…). Usando variável de ambiente.`
      );
    } else {
      console.warn(
        `[platform-commercial] Ignorando Price ID inválido em ${fieldLabel} (esperado price_… da Stripe). Usando variável de ambiente.`
      );
    }
  }
  return normalizeStripePriceIdInput(envField);
}

/** Diagnóstico sem ecoar valores (evita vazar env / Mongo em APIs e logs ao cliente). */
function effectiveStripePriceStatusHint(label: string, raw: string): string {
  const s = normalizeStripePriceIdInput(raw);
  if (!s) {
    return `${label}: ausente — defina as variáveis na Vercel no ambiente do deploy (ex.: Production) e faça redeploy.`;
  }
  const why = explainInvalidStripePriceId(s);
  if (why) return `${label}: ${why}`;
  return `${label}: formato inválido — use só o Price ID (price_…) copiado da Stripe.`;
}

/** Explicação curta para o operador (prod_ vs price_, valor em reais, etc.). */
export function explainInvalidStripePriceId(value: string | null | undefined): string | null {
  const s = normalizeStripePriceIdInput(value);
  if (!s) return null;
  if (isStripeProductId(s)) {
    return "Você está usando ID de Produto (prod_…). Troque pelo Price ID (price_…): Dashboard Stripe → Products → abra o produto → na lista de preços, cada linha tem um API ID começando com price_.";
  }
  const looksLikeMoney = /^[\d\s.,]+$/.test(s.replace(/^[Rr]\$\s?/, "").trim());
  if (looksLikeMoney) {
    return "Parece valor monetário, não um ID. No Stripe, abra o preço de assinatura e copie o Price ID (price_…).";
  }
  if (s.startsWith("price_") && !isValidStripePriceId(s)) {
    return "O id price_ parece truncado ou com caracteres inválidos; copie o valor inteiro da coluna Price ID.";
  }
  return null;
}

/** Lê Price IDs do env (checkout legado). Retorna null se Pro/Business obrigatórios faltarem. */
export function readEnvStripePriceIds(): {
  pro: string;
  business: string;
  proAnnual: string;
  businessAnnual: string;
} | null {
  const pro = normalizeStripePriceIdInput(process.env.STRIPE_PRICE_ID_PRO);
  const business = normalizeStripePriceIdInput(process.env.STRIPE_PRICE_ID_BUSINESS);
  if (!pro || !business) return null;
  return {
    pro,
    business,
    proAnnual: normalizeStripePriceIdInput(process.env.STRIPE_PRICE_ID_PRO_ANNUAL),
    businessAnnual: normalizeStripePriceIdInput(process.env.STRIPE_PRICE_ID_BUSINESS_ANNUAL),
  };
}

export function mergeDisplayPricingFromDoc(doc: PlatformCommercialDoc | null): CommercialDisplayPricing {
  const d = PRICING_BRL;
  return {
    proSeatMonth:
      typeof doc?.proSeatMonth === "number" && Number.isFinite(doc.proSeatMonth) ? roundBrl2(doc.proSeatMonth) : d.proSeatMonth,
    proSeatYear: typeof doc?.proSeatYear === "number" && Number.isFinite(doc.proSeatYear) ? roundBrl2(doc.proSeatYear) : d.proSeatYear,
    businessSeatMonth:
      typeof doc?.businessSeatMonth === "number" && Number.isFinite(doc.businessSeatMonth)
        ? roundBrl2(doc.businessSeatMonth)
        : d.businessSeatMonth,
    businessSeatYear:
      typeof doc?.businessSeatYear === "number" && Number.isFinite(doc.businessSeatYear)
        ? roundBrl2(doc.businessSeatYear)
        : d.businessSeatYear,
  };
}

export function catalogFlagsFromDoc(doc: PlatformCommercialDoc | null): { proEnabled: boolean; businessEnabled: boolean } {
  return {
    proEnabled: doc?.proEnabled !== false,
    businessEnabled: doc?.businessEnabled !== false,
  };
}

export async function getPlatformCommercialDocUncached(): Promise<PlatformCommercialDoc | null> {
  if (!isMongoConfigured()) return null;
  const db = await getDb();
  const col = db.collection<PlatformCommercialDoc>(COL);
  const raw = await col.findOne({ _id: DOC_ID });
  return raw ?? null;
}

const getCachedPlatformDoc = unstable_cache(
  async () => getPlatformCommercialDocUncached(),
  ["platform-commercial-settings-doc-v1"],
  { tags: [COMMERCIAL_SETTINGS_CACHE_TAG], revalidate: 120 }
);

/** Documento com cache (páginas públicas / GET catálogo). */
export async function getPlatformCommercialDoc(): Promise<PlatformCommercialDoc | null> {
  return getCachedPlatformDoc();
}

export async function getEffectiveDisplayPricing(): Promise<CommercialDisplayPricing> {
  const doc = await getPlatformCommercialDoc();
  return mergeDisplayPricingFromDoc(doc);
}

export async function getPublicCommercialCatalog(): Promise<PublicCommercialCatalog> {
  const doc = await getPlatformCommercialDoc();
  return {
    pricing: mergeDisplayPricingFromDoc(doc),
    ...catalogFlagsFromDoc(doc),
  };
}

/** Catálogo quando Mongo não responde (evita a landing presa a “carregar” com RSC a aguardar). */
export function getDefaultPublicCatalog(): PublicCommercialCatalog {
  return {
    pricing: mergeDisplayPricingFromDoc(null),
    ...catalogFlagsFromDoc(null),
  };
}

/**
 * Lê o catálogo comercial a partir do Mongo; se a operação exceder o tempo, devolve o catálogo default.
 * Útil na landing pública para não bloquear o HTML quando a rede/Atlas está lenta ou indisponível.
 */
export async function getPublicCommercialCatalogResilient(
  timeoutMs: number = 8_000
): Promise<PublicCommercialCatalog> {
  const t = Math.min(Math.max(Math.floor(timeoutMs), 1_000), 25_000);
  try {
    return await Promise.race([
      getPublicCommercialCatalog(),
      new Promise<PublicCommercialCatalog>((_, reject) => {
        setTimeout(() => reject(new Error("public_catalog_timeout")), t);
      }),
    ]);
  } catch {
    return getDefaultPublicCatalog();
  }
}

export async function getEffectiveStripePriceIds(): Promise<{
  pro: string;
  business: string;
  proAnnual: string;
  businessAnnual: string;
}> {
  const doc = await getPlatformCommercialDocUncached();
  const env = readEnvStripePriceIds();
  if (!env) {
    throw new Error("Stripe não configurado: defina STRIPE_PRICE_ID_PRO e STRIPE_PRICE_ID_BUSINESS.");
  }
  const merged = {
    pro: pickEffectivePriceId(doc?.stripePriceIdPro, env.pro, "MongoDB stripePriceIdPro"),
    business: pickEffectivePriceId(doc?.stripePriceIdBusiness, env.business, "MongoDB stripePriceIdBusiness"),
    proAnnual: pickEffectivePriceId(doc?.stripePriceIdProAnnual, env.proAnnual, "MongoDB stripePriceIdProAnnual"),
    businessAnnual: pickEffectivePriceId(doc?.stripePriceIdBusinessAnnual, env.businessAnnual, "MongoDB stripePriceIdBusinessAnnual"),
  };
  if (!isValidStripePriceId(merged.pro) || !isValidStripePriceId(merged.business)) {
    const lines = [
      effectiveStripePriceStatusHint("PRO (config efetiva Mongo + env)", merged.pro),
      effectiveStripePriceStatusHint("BUSINESS (config efetiva Mongo + env)", merged.business),
      "Não use prod_… (produto) nem valor em reais: use Price ID price_… por preço de assinatura.",
      "No MongoDB (platform_commercial_settings), corrija ou remova stripePriceId* inválidos; opcional: npm run mongo:clear-platform-stripe-price-ids",
    ];
    throw new Error(
      "STRIPE_PRICE_ID_PRO e STRIPE_PRICE_ID_BUSINESS devem ser Price IDs (price_…). " + lines.join(" ")
    );
  }
  if (merged.proAnnual && !isValidStripePriceId(merged.proAnnual)) {
    console.warn("[platform-commercial] STRIPE_PRICE_ID_PRO_ANNUAL inválido — usando fluxo sem preço anual Pro.");
    merged.proAnnual = "";
  }
  if (merged.businessAnnual && !isValidStripePriceId(merged.businessAnnual)) {
    console.warn("[platform-commercial] STRIPE_PRICE_ID_BUSINESS_ANNUAL inválido — usando fluxo sem preço anual Business.");
    merged.businessAnnual = "";
  }
  return merged;
}

function asSet(ids: (string | null | undefined)[]): Set<string> {
  const s = new Set<string>();
  for (const id of ids) {
    const t = normalizeStripePriceIdInput(id);
    if (t && isValidStripePriceId(t)) s.add(t);
  }
  return s;
}

export function collectProPriceIdSet(doc: PlatformCommercialDoc | null, env: ReturnType<typeof readEnvStripePriceIds>): Set<string> {
  const ids: string[] = [];
  if (env?.pro) ids.push(env.pro);
  if (env?.proAnnual) ids.push(env.proAnnual);
  if (doc?.stripePriceIdPro) ids.push(doc.stripePriceIdPro);
  if (doc?.stripePriceIdProAnnual) ids.push(doc.stripePriceIdProAnnual);
  if (Array.isArray(doc?.legacyProPriceIds)) ids.push(...doc.legacyProPriceIds);
  return asSet(ids);
}

export function collectBusinessPriceIdSet(doc: PlatformCommercialDoc | null, env: ReturnType<typeof readEnvStripePriceIds>): Set<string> {
  const ids: string[] = [];
  if (env?.business) ids.push(env.business);
  if (env?.businessAnnual) ids.push(env.businessAnnual);
  if (doc?.stripePriceIdBusiness) ids.push(doc.stripePriceIdBusiness);
  if (doc?.stripePriceIdBusinessAnnual) ids.push(doc.stripePriceIdBusinessAnnual);
  if (Array.isArray(doc?.legacyBusinessPriceIds)) ids.push(...doc.legacyBusinessPriceIds);
  return asSet(ids);
}

export async function resolveBillingPlanFromStripeSubscription(
  subscription: Stripe.Subscription,
  /** Metadados da Checkout Session quando a Subscription ainda não copiou plan/org (fallback). */
  fallbackMetadata?: Stripe.Metadata | null
): Promise<"pro" | "business" | null> {
  const metaPlan = subscription.metadata?.plan;
  if (metaPlan === "pro" || metaPlan === "business") return metaPlan;

  const fbPlan = fallbackMetadata?.plan;
  if (fbPlan === "pro" || fbPlan === "business") return fbPlan;

  const priceId = subscription.items.data?.[0]?.price?.id;
  if (!priceId) return null;

  const doc = await getPlatformCommercialDocUncached();
  const env = readEnvStripePriceIds();
  if (collectProPriceIdSet(doc, env).has(priceId)) return "pro";
  if (collectBusinessPriceIdSet(doc, env).has(priceId)) return "business";
  return null;
}

async function ensureStripeProductId(
  stripe: Stripe,
  plan: "pro" | "business",
  doc: PlatformCommercialDoc | null,
  envIds: NonNullable<ReturnType<typeof readEnvStripePriceIds>>
): Promise<{ productId: string; docPatch: Partial<PlatformCommercialDoc> }> {
  const field = plan === "pro" ? ("stripeProductIdPro" as const) : ("stripeProductIdBusiness" as const);
  const existing = doc?.[field]?.trim();
  if (existing?.startsWith("prod_")) {
    return { productId: existing, docPatch: {} };
  }
  const envKey = plan === "pro" ? "STRIPE_PRODUCT_ID_PRO" : "STRIPE_PRODUCT_ID_BUSINESS";
  const fromEnv = process.env[envKey]?.trim();
  if (fromEnv?.startsWith("prod_")) {
    return { productId: fromEnv, docPatch: { [field]: fromEnv } };
  }
  const seedPriceId = plan === "pro" ? envIds.pro : envIds.business;
  const p = await stripe.prices.retrieve(seedPriceId);
  const prod = typeof p.product === "string" ? p.product : p.product.id;
  if (!prod.startsWith("prod_")) throw new Error(`Produto Stripe inválido para ${plan}.`);
  return { productId: prod, docPatch: { [field]: prod } };
}

function brlMonthToUnitAmount(brl: number): number {
  const n = Math.round(brl * 100);
  if (!Number.isFinite(n) || n < 1) throw new Error("Valor BRL inválido.");
  return n;
}

/** Anual: valor exibido é R$/assento/mês com faturamento anual → cobrança = mês × 12. */
function brlYearDisplayToAnnualUnitAmount(brlPerMonthDisplay: number): number {
  return brlMonthToUnitAmount(brlPerMonthDisplay * 12);
}

type SlotKey = "proMonth" | "proYear" | "businessMonth" | "businessYear";

async function createPriceForSlot(
  stripe: Stripe,
  productId: string,
  plan: "pro" | "business",
  slot: SlotKey,
  brlDisplay: number
): Promise<string> {
  const wantYear = slot === "proYear" || slot === "businessYear";
  const params: Stripe.PriceCreateParams = {
    currency: "brl",
    product: productId,
    metadata: { plan },
    recurring: {
      interval: wantYear ? "year" : "month",
    },
    unit_amount: wantYear ? brlYearDisplayToAnnualUnitAmount(brlDisplay) : brlMonthToUnitAmount(brlDisplay),
  };
  const price = await stripe.prices.create(params);
  return price.id;
}

async function tryDeactivatePrice(stripe: Stripe, priceId: string | null | undefined): Promise<void> {
  const id = priceId?.trim();
  if (!id) return;
  try {
    await stripe.prices.update(id, { active: false });
  } catch (e) {
    console.warn("[platform-commercial] não foi possível desativar um preço Stripe no Dashboard (operação interna).", e);
  }
}

export type CommercialSettingsPatchInput = {
  proEnabled: boolean;
  businessEnabled: boolean;
  proSeatMonth: number;
  proSeatYear: number;
  businessSeatMonth: number;
  businessSeatYear: number;
  publishStripe: boolean;
};

export async function updatePlatformCommercialSettings(input: CommercialSettingsPatchInput): Promise<PlatformCommercialDoc> {
  if (!isMongoConfigured()) {
    throw new Error("MongoDB não configurado — não é possível gravar configuração comercial.");
  }

  const prev = await getPlatformCommercialDocUncached();
  const prevDisplay = mergeDisplayPricingFromDoc(prev);

  const next: PlatformCommercialDoc = {
    _id: DOC_ID,
    proEnabled: input.proEnabled,
    businessEnabled: input.businessEnabled,
    proSeatMonth: roundBrl2(input.proSeatMonth),
    proSeatYear: roundBrl2(input.proSeatYear),
    businessSeatMonth: roundBrl2(input.businessSeatMonth),
    businessSeatYear: roundBrl2(input.businessSeatYear),
    stripePriceIdPro: prev?.stripePriceIdPro ?? null,
    stripePriceIdBusiness: prev?.stripePriceIdBusiness ?? null,
    stripePriceIdProAnnual: prev?.stripePriceIdProAnnual ?? null,
    stripePriceIdBusinessAnnual: prev?.stripePriceIdBusinessAnnual ?? null,
    legacyProPriceIds: [...(prev?.legacyProPriceIds ?? [])],
    legacyBusinessPriceIds: [...(prev?.legacyBusinessPriceIds ?? [])],
    stripeProductIdPro: prev?.stripeProductIdPro ?? null,
    stripeProductIdBusiness: prev?.stripeProductIdBusiness ?? null,
    updatedAt: new Date().toISOString(),
  };

  if (input.publishStripe) {
    const secret = process.env.STRIPE_SECRET_KEY?.trim();
    if (!secret) throw new Error("STRIPE_SECRET_KEY ausente.");
    const envIds = readEnvStripePriceIds();
    if (!envIds) throw new Error("Defina STRIPE_PRICE_ID_PRO e STRIPE_PRICE_ID_BUSINESS para publicar preços.");

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(secret);

    const proP = await ensureStripeProductId(stripe, "pro", prev, envIds);
    Object.assign(next, proP.docPatch);
    const bizP = await ensureStripeProductId(stripe, "business", prev, envIds);
    Object.assign(next, bizP.docPatch);

    const slots: {
      slot: SlotKey;
      plan: "pro" | "business";
      productId: string;
      field: keyof PlatformCommercialDoc;
      brl: number;
      prevBrl: number;
      prevId: string | null | undefined;
    }[] = [
      {
        slot: "proMonth",
        plan: "pro",
        productId: proP.productId,
        field: "stripePriceIdPro",
        brl: input.proSeatMonth,
        prevBrl: prevDisplay.proSeatMonth,
        prevId: prev?.stripePriceIdPro,
      },
      {
        slot: "proYear",
        plan: "pro",
        productId: proP.productId,
        field: "stripePriceIdProAnnual",
        brl: input.proSeatYear,
        prevBrl: prevDisplay.proSeatYear,
        prevId: prev?.stripePriceIdProAnnual,
      },
      {
        slot: "businessMonth",
        plan: "business",
        productId: bizP.productId,
        field: "stripePriceIdBusiness",
        brl: input.businessSeatMonth,
        prevBrl: prevDisplay.businessSeatMonth,
        prevId: prev?.stripePriceIdBusiness,
      },
      {
        slot: "businessYear",
        plan: "business",
        productId: bizP.productId,
        field: "stripePriceIdBusinessAnnual",
        brl: input.businessSeatYear,
        prevBrl: prevDisplay.businessSeatYear,
        prevId: prev?.stripePriceIdBusinessAnnual,
      },
    ];

    for (const row of slots) {
      const needNew = !brlCentsEqual(row.brl, row.prevBrl) || !row.prevId?.trim();
      if (!needNew) continue;

      const newId = await createPriceForSlot(stripe, row.productId, row.plan, row.slot, row.brl);
      const oldId = row.prevId?.trim();
      if (oldId) {
        if (row.plan === "pro") {
          const leg = new Set(next.legacyProPriceIds ?? []);
          leg.add(oldId);
          next.legacyProPriceIds = [...leg];
        } else {
          const leg = new Set(next.legacyBusinessPriceIds ?? []);
          leg.add(oldId);
          next.legacyBusinessPriceIds = [...leg];
        }
        await tryDeactivatePrice(stripe, oldId);
      }
      if (row.field === "stripePriceIdPro") next.stripePriceIdPro = newId;
      else if (row.field === "stripePriceIdProAnnual") next.stripePriceIdProAnnual = newId;
      else if (row.field === "stripePriceIdBusiness") next.stripePriceIdBusiness = newId;
      else if (row.field === "stripePriceIdBusinessAnnual") next.stripePriceIdBusinessAnnual = newId;
    }
  }

  const db = await getDb();
  const col = db.collection<PlatformCommercialDoc>(COL);
  await col.updateOne({ _id: DOC_ID }, { $set: next }, { upsert: true });

  return next;
}
