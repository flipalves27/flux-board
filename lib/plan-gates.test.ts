import { afterEach, describe, expect, it } from "vitest";
import { assertFeatureAllowed, PlanGateError, getEffectiveTier, canUseFeature } from "./plan-gates";

describe("plan-gates", () => {
  const prevEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...prevEnv };
  });

  it("returns enterprise tier for admin superpowers by default", () => {
    const tier = getEffectiveTier({ _id: "o1", plan: "free" } as any, { isOrgAdmin: true });
    expect(tier).toBe("enterprise");
  });

  it("respects org plan when admin superpowers are disabled", () => {
    process.env.FLUX_ADMIN_SUPERPOWERS = "false";
    const tier = getEffectiveTier({ _id: "o1", plan: "free" } as any, { isOrgAdmin: true });
    expect(tier).toBe("free");
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

  it("allows admin bypass when enabled", () => {
    process.env.FLUX_ADMIN_SUPERPOWERS = "true";
    const allowed = canUseFeature({ _id: "o1", plan: "free" } as any, "board_health_score", { isOrgAdmin: true });
    expect(allowed).toBe(true);
  });
});
