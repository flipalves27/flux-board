import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const getAuthFromRequest = vi.fn();
const listAllUsersPaginated = vi.fn();
const ensureAdminUser = vi.fn();

vi.mock("@/lib/auth", () => ({
  getAuthFromRequest: (...args: unknown[]) => getAuthFromRequest(...args),
}));

vi.mock("@/lib/kv-users", () => ({
  ensureAdminUser: (...args: unknown[]) => ensureAdminUser(...args),
  listAllUsersPaginated: (...args: unknown[]) => listAllUsersPaginated(...args),
}));

describe("GET /api/admin/platform-users", () => {
  beforeEach(() => {
    getAuthFromRequest.mockReset();
    listAllUsersPaginated.mockReset();
    ensureAdminUser.mockResolvedValue(undefined);
  });

  it("returns 403 for org gestor (platform_user)", async () => {
    getAuthFromRequest.mockResolvedValue({
      id: "u1",
      username: "owner",
      isAdmin: true,
      isExecutive: false,
      orgId: "org_a",
      platformRole: "platform_user",
      orgRole: "gestor",
      seesAllBoardsInOrg: true,
      isOrgTeamManager: true,
    });
    const req = new NextRequest("http://localhost/api/admin/platform-users");
    const res = await GET(req);
    expect(res.status).toBe(403);
    expect(listAllUsersPaginated).not.toHaveBeenCalled();
  });

  it("returns 200 for platform admin", async () => {
    getAuthFromRequest.mockResolvedValue({
      id: "admin",
      username: "Admin",
      isAdmin: true,
      isExecutive: false,
      orgId: "org_default",
      platformRole: "platform_admin",
      orgRole: "membro",
      seesAllBoardsInOrg: true,
      isOrgTeamManager: true,
    });
    listAllUsersPaginated.mockResolvedValue({
      users: [],
      nextCursor: null,
      storage: "mongo" as const,
    });
    const req = new NextRequest("http://localhost/api/admin/platform-users");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(listAllUsersPaginated).toHaveBeenCalled();
  });
});
