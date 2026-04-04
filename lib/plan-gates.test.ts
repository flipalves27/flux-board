import { afterEach, describe, expect, it } from "vitest";
import { assertFeatureAllowed, PlanGateError, getEffectiveTier, canUseFeature, planGateCtxFromAuthPayload } from "./plan-gates";

describe("plan-gates", () => {
  const prevEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...prevEnv };
  });

  it("returns business for platform admin regardless of org plan and FLUX_ADMIN_SUPERPOWERS", () => {
    process.env.FLUX_ADMIN_SUPERPOWERS = "false";
    const ctx = planGateCtxFromAuthPayload({
      id: "admin",
      isAdmin: true,
      isExecutive: false,
    });
    const tier = getEffectiveTier({ _id: "o1", plan: "free" } as any, ctx);
    expect(tier).toBe("business");
  });

  it("does not give org admin business bypass tier when superpowers are disabled", () => {
    process.env.FLUX_ADMIN_SUPERPOWERS = "false";
    const ctx = planGateCtxFromAuthPayload({
      id: "u1",
      isAdmin: true,
      isExecutive: false,
    });
    const tier = getEffectiveTier({ _id: "o1", plan: "free" } as any, ctx);
    expect(tier).toBe("free");
  });

  it("gives org admin business tier when superpowers are enabled", () => {
    process.env.FLUX_ADMIN_SUPERPOWERS = "true";
    const ctx = planGateCtxFromAuthPayload({
      id: "u1",
      isAdmin: true,
      isExecutive: false,
    });
    const tier = getEffectiveTier({ _id: "o1", plan: "free" } as any, ctx);
    expect(tier).toBe("business");
  });

  it("throws standardized gate error payload", () => {
    process.env.FLUX_ADMIN_SUPERPOWERS = "false";
    expect(() => assertFeatureAllowed({ _id: "o1", plan: "free" } as any, "sprint_engine")).toThrowError(PlanGateError);
    try {
      assertFeatureAllowed({ _id: "o1", plan: "free" } as any, "sprint_engine");
    } catch (err) {
      const gate = err as PlanGateError;
      expect(gate.status).toBe(402);
      expect(gate.code).toBe("PLAN_UPGRADE_REQUIRED");
      expect(gate.feature).toBe("sprint_engine");
      expect(gate.currentTier).toBe("free");
    }
  });

  it("allows org admin bypass when superpowers enabled", () => {
    process.env.FLUX_ADMIN_SUPERPOWERS = "true";
    const allowed = canUseFeature({ _id: "o1", plan: "free" } as any, "board_health_score", {
      isOrgAdmin: true,
    });
    expect(allowed).toBe(true);
  });
});
