import { describe, expect, it } from "vitest";
import { isSameOrgOrPlatformAdmin } from "./tenant-route-guard";

describe("isSameOrgOrPlatformAdmin", () => {
  it("allows same org for org member", () => {
    expect(
      isSameOrgOrPlatformAdmin(
        {
          id: "u1",
          orgId: "org_a",
          platformRole: "platform_user",
          orgRole: "org_member",
        },
        "org_a"
      )
    ).toBe(true);
  });

  it("denies other org for org manager (not platform admin)", () => {
    expect(
      isSameOrgOrPlatformAdmin(
        {
          id: "u1",
          orgId: "org_a",
          platformRole: "platform_user",
          orgRole: "org_manager",
        },
        "org_b"
      )
    ).toBe(false);
  });

  it("allows other org for platform admin", () => {
    expect(
      isSameOrgOrPlatformAdmin(
        {
          id: "support",
          orgId: "org_a",
          platformRole: "platform_admin",
          orgRole: "org_member",
        },
        "org_b"
      )
    ).toBe(true);
  });

  it("allows other org when JWT carries platform_admin", () => {
    expect(
      isSameOrgOrPlatformAdmin(
        {
          id: "admin",
          orgId: "org_default",
          platformRole: "platform_admin",
          orgRole: "org_member",
        },
        "org_xyz"
      )
    ).toBe(true);
  });
});
