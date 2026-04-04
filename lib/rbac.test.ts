import { describe, expect, it } from "vitest";
import { deriveEffectiveRoles, canManageOrganization, isPlatformAdminSession, seesAllBoardsInOrg } from "./rbac";

describe("rbac roles", () => {
  it("keeps platform admin isolated from org role", () => {
    const roles = deriveEffectiveRoles({ id: "admin", isAdmin: false, isExecutive: false });
    expect(roles.platformRole).toBe("platform_admin");
    expect(roles.orgRole).toBe("membro");
    expect(canManageOrganization(roles)).toBe(true);
    expect(seesAllBoardsInOrg(roles)).toBe(true);
  });

  it("maps org admin flag to gestor", () => {
    const roles = deriveEffectiveRoles({ id: "u1", isAdmin: true });
    expect(roles.platformRole).toBe("platform_user");
    expect(roles.orgRole).toBe("gestor");
  });

  it("maps legacy org_manager to gestor", () => {
    const roles = deriveEffectiveRoles({ id: "u2", orgRole: "org_manager" });
    expect(roles.orgRole).toBe("gestor");
  });

  it("maps explicit convidado", () => {
    const roles = deriveEffectiveRoles({ id: "u3", orgRole: "convidado", isAdmin: true });
    expect(roles.orgRole).toBe("convidado");
    expect(seesAllBoardsInOrg(roles)).toBe(false);
  });

  it("isPlatformAdminSession is false for org gestor only", () => {
    expect(isPlatformAdminSession({ id: "owner1", platformRole: "platform_user", orgRole: "gestor" })).toBe(false);
  });

  it("isPlatformAdminSession is true for explicit platform_admin", () => {
    expect(isPlatformAdminSession({ id: "ops", platformRole: "platform_admin", orgRole: "membro" })).toBe(true);
  });

  it("isPlatformAdminSession is true for seed admin id", () => {
    expect(isPlatformAdminSession({ id: "admin" })).toBe(true);
  });
});
