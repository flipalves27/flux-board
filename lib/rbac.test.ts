import { describe, expect, it } from "vitest";
import { deriveEffectiveRoles, canManageOrganization } from "./rbac";

describe("rbac roles", () => {
  it("keeps platform admin isolated from org role", () => {
    const roles = deriveEffectiveRoles({ id: "admin", isAdmin: false, isExecutive: false });
    expect(roles.platformRole).toBe("platform_admin");
    expect(roles.orgRole).toBe("org_member");
    expect(canManageOrganization(roles)).toBe(true);
  });

  it("maps org admin to org manager", () => {
    const roles = deriveEffectiveRoles({ id: "u1", isAdmin: true });
    expect(roles.platformRole).toBe("platform_user");
    expect(roles.orgRole).toBe("org_manager");
  });
});
