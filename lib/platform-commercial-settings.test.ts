import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  collectBusinessPriceIdSet,
  collectProPriceIdSet,
  mergeDisplayPricingFromDoc,
  readEnvStripePriceIds,
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
