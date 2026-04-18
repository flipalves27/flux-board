import { describe, expect, it, afterEach } from "vitest";
import { envDefaultOnda4Enabled, resolveOnda4Flags } from "./onda4-flags";
import type { Organization } from "./kv-organizations";

describe("resolveOnda4Flags", () => {
  const prev = process.env.FLUX_ONDA4_DEFAULT_ENABLED;
  const prevNode = process.env.NODE_ENV;

  afterEach(() => {
    if (prev === undefined) delete process.env.FLUX_ONDA4_DEFAULT_ENABLED;
    else process.env.FLUX_ONDA4_DEFAULT_ENABLED = prev;
    process.env.NODE_ENV = prevNode;
  });

  it("honours org overrides when set", () => {
    process.env.FLUX_ONDA4_DEFAULT_ENABLED = "0";
    process.env.NODE_ENV = "production";
    const org = {
      _id: "org_x",
      ui: { onda4: { enabled: true, omnibar: false, dailyBriefing: true, anomalyToasts: false } },
    } as unknown as Organization;
    expect(resolveOnda4Flags(org)).toEqual({
      enabled: true,
      omnibar: false,
      dailyBriefing: true,
      anomalyToasts: false,
    });
  });

  it("sub-flags inherit enabled when omitted", () => {
    process.env.FLUX_ONDA4_DEFAULT_ENABLED = "0";
    process.env.NODE_ENV = "production";
    const org = { _id: "org_x", ui: { onda4: { enabled: true } } } as unknown as Organization;
    expect(resolveOnda4Flags(org)).toEqual({
      enabled: true,
      omnibar: true,
      dailyBriefing: true,
      anomalyToasts: true,
    });
  });
});

describe("envDefaultOnda4Enabled", () => {
  const prev = process.env.FLUX_ONDA4_DEFAULT_ENABLED;
  const prevNode = process.env.NODE_ENV;

  afterEach(() => {
    if (prev === undefined) delete process.env.FLUX_ONDA4_DEFAULT_ENABLED;
    else process.env.FLUX_ONDA4_DEFAULT_ENABLED = prev;
    process.env.NODE_ENV = prevNode;
  });

  it("respects FLUX_ONDA4_DEFAULT_ENABLED=1", () => {
    process.env.FLUX_ONDA4_DEFAULT_ENABLED = "1";
    process.env.NODE_ENV = "production";
    expect(envDefaultOnda4Enabled()).toBe(true);
  });
});
