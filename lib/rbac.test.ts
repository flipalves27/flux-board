import { describe, expect, it } from "vitest";
import { deriveEffectiveRoles, canManageOrganization, isPlatformAdminSession } from "./rbac";

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

  it("isPlatformAdminSession is false for org admin only", () => {
    expect(isPlatformAdminSession({ id: "owner1", platformRole: "platform_user", orgRole: "org_manager" })).toBe(
      false
    );
  });

  it("isPlatformAdminSession is true for explicit platform_admin", () => {
    expect(isPlatformAdminSession({ id: "ops", platformRole: "platform_admin", orgRole: "org_member" })).toBe(true);
  });

  it("isPlatformAdminSession is true for seed admin id", () => {
    expect(isPlatformAdminSession({ id: "admin" })).toBe(true);
  });
});
