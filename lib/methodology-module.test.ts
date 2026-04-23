import { describe, expect, it } from "vitest";
import { getMethodologyModule, listMethodologyModuleKeys } from "./methodology-module";

describe("methodology-module", () => {
  it("getMethodologyModule registers LSS detail strip and restricts Eisenhower", () => {
    const lss = getMethodologyModule("lean_six_sigma");
    expect(lss.detailChromeStrip).toBe("lss_context");
    expect(lss.allowedViewModes).not.toContain("eisenhower");
  });

  it("getMethodologyModule uses scrum product goal strip for scrum", () => {
    expect(getMethodologyModule("scrum").detailChromeStrip).toBe("scrum_product_goal");
  });

  it("getMethodologyModule registers SAFE detail strip and restricts Eisenhower", () => {
    const safe = getMethodologyModule("safe");
    expect(safe.detailChromeStrip).toBe("safe_context");
    expect(safe.allowedViewModes).not.toContain("eisenhower");
  });

  it("listMethodologyModuleKeys includes discovery", () => {
    expect(listMethodologyModuleKeys()).toContain("discovery");
    expect(listMethodologyModuleKeys()).toContain("safe");
  });
});
