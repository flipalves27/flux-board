import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  collectBusinessPriceIdSet,
  collectProPriceIdSet,
  explainInvalidStripePriceId,
  isValidStripePriceId,
  mergeDisplayPricingFromDoc,
  normalizeStripePriceIdInput,
  readEnvStripePriceIds,
  resolveBillingPlanFromStripeSubscription,
  type PlatformCommercialDoc,
} from "./platform-commercial-settings";
import { PRICING_BRL, brlCentsEqual, formatBrl, roundBrl2 } from "./billing-pricing";
import { PlatformCommercialSettingsPatchSchema } from "./schemas";

describe("mergeDisplayPricingFromDoc", () => {
  it("uses PRICING_BRL when doc is null", () => {
    expect(mergeDisplayPricingFromDoc(null)).toEqual({ ...PRICING_BRL });
  });

  it("overrides from doc when set", () => {
    const doc: PlatformCommercialDoc = {
      _id: "default",
      proSeatMonth: 55,
      businessSeatYear: 70,
    };
    const m = mergeDisplayPricingFromDoc(doc);
    expect(m.proSeatMonth).toBe(55);
    expect(m.proSeatYear).toBe(PRICING_BRL.proSeatYear);
    expect(m.businessSeatYear).toBe(70);
  });

  it("rounds doc values to centavos", () => {
    const doc: PlatformCommercialDoc = {
      _id: "default",
      proSeatMonth: 49.996,
    };
    expect(mergeDisplayPricingFromDoc(doc).proSeatMonth).toBe(50);
  });
});

describe("roundBrl2 / brlCentsEqual / formatBrl", () => {
  it("roundBrl2 normalizes to centavos", () => {
    expect(roundBrl2(49.999)).toBe(50);
    expect(roundBrl2(49.991)).toBe(49.99);
  });

  it("brlCentsEqual compares in centavos", () => {
    expect(brlCentsEqual(49.9, 49.9)).toBe(true);
    expect(brlCentsEqual(49.9, 49.81)).toBe(false);
  });

  it("formatBrl shows centavos when needed", () => {
    expect(formatBrl(49)).toMatch(/49/);
    expect(formatBrl(49.9)).toMatch(/49[,.]90/);
  });
});

describe("PlatformCommercialSettingsPatchSchema", () => {
  const base = {
    proEnabled: true,
    businessEnabled: true,
    proSeatMonth: 49.99,
    proSeatYear: 39.5,
    businessSeatMonth: 99,
    businessSeatYear: 79.25,
    publishStripe: false,
  };

  it("accepts up to two decimal places", () => {
    const p = PlatformCommercialSettingsPatchSchema.safeParse(base);
    expect(p.success).toBe(true);
  });

  it("rejects more than two decimal places", () => {
    const p = PlatformCommercialSettingsPatchSchema.safeParse({
      ...base,
      proSeatMonth: 49.999,
    });
    expect(p.success).toBe(false);
  });
});

describe("explainInvalidStripePriceId", () => {
  it("detects product id vs price id", () => {
    expect(explainInvalidStripePriceId("prod_UEufQnvD0fjwBV")).toContain("Produto");
    expect(explainInvalidStripePriceId("price_1Ab")).toBe(null);
  });

  it("detects BRL-like strings", () => {
    expect(explainInvalidStripePriceId("39,99")).toMatch(/monet[aá]rio|Price ID/i);
  });
});

describe("resolveBillingPlanFromStripeSubscription", () => {
  it("uses session metadata plan when subscription.metadata.plan is missing", async () => {
    const sub = {
      metadata: {},
      items: { data: [{ price: { id: "price_would_need_mongo" } }] },
    } as unknown as import("stripe").Stripe.Subscription;
    await expect(
      resolveBillingPlanFromStripeSubscription(sub, { plan: "pro", orgId: "org1" })
    ).resolves.toBe("pro");
  });
});

describe("normalizeStripePriceIdInput", () => {
  it("strips BOM and surrounding quotes", () => {
    expect(normalizeStripePriceIdInput('\uFEFF"price_1Ab"')).toBe("price_1Ab");
    expect(normalizeStripePriceIdInput("'price_1X'")).toBe("price_1X");
  });
});

describe("isValidStripePriceId", () => {
  it("rejects BRL amounts and garbage", () => {
    expect(isValidStripePriceId("19,99")).toBe(false);
    expect(isValidStripePriceId("19.99")).toBe(false);
    expect(isValidStripePriceId("")).toBe(false);
    expect(isValidStripePriceId("price_")).toBe(false);
  });

  it("accepts Stripe price_ ids", () => {
    expect(isValidStripePriceId("price_1N2abcdEFG")).toBe(true);
    expect(isValidStripePriceId("  price_1N2abcdEFG  ")).toBe(true);
  });
});

describe("price id sets for webhook resolution", () => {
  const env = { pro: "price_pro_e", business: "price_bus_e", proAnnual: "price_pro_y", businessAnnual: "price_bus_y" };

  beforeEach(() => {
    vi.stubEnv("STRIPE_PRICE_ID_PRO", env.pro);
    vi.stubEnv("STRIPE_PRICE_ID_BUSINESS", env.business);
    vi.stubEnv("STRIPE_PRICE_ID_PRO_ANNUAL", env.proAnnual);
    vi.stubEnv("STRIPE_PRICE_ID_BUSINESS_ANNUAL", env.businessAnnual);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("readEnvStripePriceIds reads env", () => {
    expect(readEnvStripePriceIds()).toEqual(env);
  });

  it("collectProPriceIdSet merges env, doc active, and legacy", () => {
    const doc: PlatformCommercialDoc = {
      _id: "default",
      stripePriceIdPro: "price_pro_db",
      legacyProPriceIds: ["price_old_pro"],
    };
    const s = collectProPriceIdSet(doc, readEnvStripePriceIds());
    expect(s.has(env.pro)).toBe(true);
    expect(s.has(env.proAnnual)).toBe(true);
    expect(s.has("price_pro_db")).toBe(true);
    expect(s.has("price_old_pro")).toBe(true);
  });

  it("collectProPriceIdSet ignores invalid doc price strings (ex. BRL pasted as ID)", () => {
    const doc: PlatformCommercialDoc = { _id: "default", stripePriceIdPro: "19,99" };
    const s = collectProPriceIdSet(doc, readEnvStripePriceIds());
    expect(s.has(env.pro)).toBe(true);
    expect(s.has("19,99")).toBe(false);
  });

  it("collectBusinessPriceIdSet merges tiers", () => {
    const doc: PlatformCommercialDoc = {
      _id: "default",
      stripePriceIdBusinessAnnual: "price_bus_ann_db",
      legacyBusinessPriceIds: ["price_legacy_b"],
    };
    const s = collectBusinessPriceIdSet(doc, readEnvStripePriceIds());
    expect(s.has(env.business)).toBe(true);
    expect(s.has("price_bus_ann_db")).toBe(true);
    expect(s.has("price_legacy_b")).toBe(true);
  });
});
