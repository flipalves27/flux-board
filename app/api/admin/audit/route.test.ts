import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const getAuthFromRequest = vi.fn();
const listAuditEventsPaginated = vi.fn();

vi.mock("@/lib/auth", () => ({
  getAuthFromRequest: (...args: unknown[]) => getAuthFromRequest(...args),
}));

vi.mock("@/lib/audit-events", () => ({
  listAuditEventsPaginated: (...args: unknown[]) => listAuditEventsPaginated(...args),
}));

describe("GET /api/admin/audit", () => {
  beforeEach(() => {
    getAuthFromRequest.mockReset();
    listAuditEventsPaginated.mockReset();
  });

  it("returns 403 for platform_user gestor", async () => {
    getAuthFromRequest.mockResolvedValue({
      id: "u1",
      username: "owner",
      isAdmin: true,
      orgId: "org_a",
      platformRole: "platform_user",
      orgRole: "gestor",
    });
    const req = new NextRequest("http://localhost/api/admin/audit");
    const res = await GET(req);
    expect(res.status).toBe(403);
    expect(listAuditEventsPaginated).not.toHaveBeenCalled();
  });

  it("returns 200 for platform admin", async () => {
    getAuthFromRequest.mockResolvedValue({
      id: "admin",
      username: "Admin",
      isAdmin: true,
      orgId: "org_default",
      platformRole: "platform_admin",
      orgRole: "membro",
    });
    listAuditEventsPaginated.mockResolvedValue({ events: [], nextCursor: null });
    const req = new NextRequest("http://localhost/api/admin/audit");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.events).toEqual([]);
    expect(listAuditEventsPaginated).toHaveBeenCalled();
  });
});
