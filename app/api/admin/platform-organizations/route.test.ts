import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const getAuthFromRequest = vi.fn();
const listAllOrganizationsPaginated = vi.fn();

vi.mock("@/lib/auth", () => ({
  getAuthFromRequest: (...args: unknown[]) => getAuthFromRequest(...args),
}));

vi.mock("@/lib/kv-organizations", () => ({
  listAllOrganizationsPaginated: (...args: unknown[]) => listAllOrganizationsPaginated(...args),
}));

describe("GET /api/admin/platform-organizations", () => {
  beforeEach(() => {
    getAuthFromRequest.mockReset();
    listAllOrganizationsPaginated.mockReset();
  });

  it("returns 403 for non-platform admin", async () => {
    getAuthFromRequest.mockResolvedValue({
      id: "u1",
      username: "owner",
      orgId: "org_a",
      platformRole: "platform_user",
      orgRole: "gestor",
    });
    const req = new NextRequest("http://localhost/api/admin/platform-organizations");
    const res = await GET(req);
    expect(res.status).toBe(403);
    expect(listAllOrganizationsPaginated).not.toHaveBeenCalled();
  });

  it("returns 200 for platform admin", async () => {
    getAuthFromRequest.mockResolvedValue({
      id: "admin",
      username: "Admin",
      orgId: "org_default",
      platformRole: "platform_admin",
      orgRole: "membro",
    });
    listAllOrganizationsPaginated.mockResolvedValue({
      organizations: [],
      nextCursor: null,
      storage: "mongo" as const,
    });
    const req = new NextRequest("http://localhost/api/admin/platform-organizations");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(listAllOrganizationsPaginated).toHaveBeenCalled();
  });
});
