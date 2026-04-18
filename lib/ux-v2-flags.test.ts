import { describe, expect, it } from "vitest";
import { resolveUxV2Flags } from "./ux-v2-flags";
import type { Organization } from "./kv-organizations";

function org(patch?: Organization["ui"]): Organization {
  return {
    _id: "org_test",
    name: "T",
    slug: "t",
    ownerId: "u",
    plan: "business",
    maxUsers: 10,
    maxBoards: 10,
    createdAt: new Date().toISOString(),
    ui: patch,
  };
}

describe("resolveUxV2Flags", () => {
  it("defaults all flags off", () => {
    const f = resolveUxV2Flags(org());
    expect(f.ux_v2_command_unified).toBe(false);
    expect(f.ux_v2_workbar).toBe(false);
  });

  it("honors org.ui.uxV2 overrides", () => {
    const f = resolveUxV2Flags(
      org({
        uxV2: { ux_v2_workbar: true },
      })
    );
    expect(f.ux_v2_workbar).toBe(true);
    expect(f.ux_v2_command_unified).toBe(false);
  });
});
