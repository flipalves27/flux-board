import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const getAuthFromRequest = vi.fn();
const aggregateRateLimitAbuse = vi.fn();

vi.mock("@/lib/auth", () => ({
  getAuthFromRequest: (...args: unknown[]) => getAuthFromRequest(...args),
}));

vi.mock("@/lib/rate-limit-abuse", () => ({
  aggregateRateLimitAbuse: (...args: unknown[]) => aggregateRateLimitAbuse(...args),
}));

describe("GET /api/admin/rate-limit-abuse", () => {
  beforeEach(() => {
    getAuthFromRequest.mockReset();
    aggregateRateLimitAbuse.mockReset();
  });

  it("returns 403 for org admin (platform_user)", async () => {
    getAuthFromRequest.mockResolvedValue({
      id: "u1",
      username: "owner",
      isAdmin: true,
      isExecutive: false,
      orgId: "org_a",
      platformRole: "platform_user",
      orgRole: "org_manager",
      isOrgTeamManager: false,
    });
    const req = new NextRequest("http://localhost/api/admin/rate-limit-abuse");
    const res = await GET(req);
    expect(res.status).toBe(403);
    expect(aggregateRateLimitAbuse).not.toHaveBeenCalled();
  });

  it("returns 200 for platform admin", async () => {
    getAuthFromRequest.mockResolvedValue({
      id: "admin",
      username: "Admin",
      isAdmin: true,
      isExecutive: false,
      orgId: "org_default",
      platformRole: "platform_admin",
      orgRole: "org_member",
      isOrgTeamManager: false,
    });
    aggregateRateLimitAbuse.mockResolvedValue([]);
    const req = new NextRequest("http://localhost/api/admin/rate-limit-abuse?days=7");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(aggregateRateLimitAbuse).toHaveBeenCalled();
  });
});
