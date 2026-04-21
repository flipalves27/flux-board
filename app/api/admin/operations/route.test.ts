import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const getAuthFromRequest = vi.fn();
const listPushOutbox = vi.fn();
const listIntegrationEventLogs = vi.fn();
const listPublicApiTokens = vi.fn();

vi.mock("@/lib/auth", () => ({
  getAuthFromRequest: (...args: unknown[]) => getAuthFromRequest(...args),
}));

vi.mock("@/lib/kv-push-subscriptions", () => ({
  listPushOutbox: (...args: unknown[]) => listPushOutbox(...args),
}));

vi.mock("@/lib/kv-integrations", () => ({
  listIntegrationEventLogs: (...args: unknown[]) => listIntegrationEventLogs(...args),
}));

vi.mock("@/lib/public-api-tokens", () => ({
  listPublicApiTokens: (...args: unknown[]) => listPublicApiTokens(...args),
}));

describe("GET /api/admin/operations", () => {
  beforeEach(() => {
    getAuthFromRequest.mockReset();
    listPushOutbox.mockReset();
    listIntegrationEventLogs.mockReset();
    listPublicApiTokens.mockReset();
  });

  it("returns 403 for non-platform-admin", async () => {
    getAuthFromRequest.mockResolvedValue({
      id: "u1",
      username: "owner",
      isAdmin: true,
      orgId: "org_a",
      platformRole: "platform_user",
      orgRole: "gestor",
    });
    const req = new NextRequest("http://localhost/api/admin/operations");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns compact operational snapshot for platform admin", async () => {
    getAuthFromRequest.mockResolvedValue({
      id: "admin",
      username: "Admin",
      isAdmin: true,
      orgId: "org_default",
      platformRole: "platform_admin",
      orgRole: "membro",
    });
    listPushOutbox.mockResolvedValue([
      {
        _id: "o1",
        orgId: "org_default",
        userId: "u1",
        endpoint: "https://example.com/push",
        payload: { title: "n" },
        attemptCount: 0,
        nextAttemptAt: "2000-01-01T00:00:00.000Z",
        createdAt: "2000-01-01T00:00:00.000Z",
      },
    ]);
    listIntegrationEventLogs.mockResolvedValue([
      {
        _id: "e1",
        orgId: "org_default",
        provider: "github",
        eventType: "pull_request",
        status: "synced",
        receivedAt: "2000-01-01T00:00:00.000Z",
      },
    ]);
    listPublicApiTokens.mockResolvedValue([
      {
        _id: "tok_1",
        name: "Prod",
        orgId: "org_default",
        keyPrefix: "fb",
        scopes: ["boards:read"],
        active: true,
        updatedAt: "2000-01-01T00:00:00.000Z",
      },
    ]);

    const req = new NextRequest("http://localhost/api/admin/operations?limit=10");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.pushOutbox.dueNow).toBe(1);
    expect(json.integrationLogs.synced).toBe(1);
    expect(json.publicApiTokens.active).toBe(1);
  });

  it("applies org/provider/status/token filters", async () => {
    getAuthFromRequest.mockResolvedValue({
      id: "admin",
      username: "Admin",
      isAdmin: true,
      orgId: "org_default",
      platformRole: "platform_admin",
      orgRole: "membro",
    });
    listPushOutbox.mockResolvedValue([
      {
        _id: "o1",
        orgId: "org_a",
        userId: "u1",
        endpoint: "https://example.com/push",
        payload: { title: "n" },
        attemptCount: 0,
        nextAttemptAt: "2099-01-01T00:00:00.000Z",
        createdAt: "2000-01-01T00:00:00.000Z",
      },
    ]);
    listIntegrationEventLogs.mockResolvedValue([
      {
        _id: "e1",
        orgId: "org_a",
        provider: "github",
        eventType: "pull_request",
        status: "failed",
        receivedAt: "2000-01-01T00:00:00.000Z",
      },
      {
        _id: "e2",
        orgId: "org_a",
        provider: "github",
        eventType: "pull_request",
        status: "synced",
        receivedAt: "2000-01-01T00:00:00.000Z",
      },
    ]);
    listPublicApiTokens.mockResolvedValue([
      {
        _id: "tok_1",
        name: "Prod",
        orgId: "org_a",
        keyPrefix: "fb",
        scopes: ["boards:read"],
        active: true,
        updatedAt: "2000-01-01T00:00:00.000Z",
      },
      {
        _id: "tok_2",
        name: "Old",
        orgId: "org_a",
        keyPrefix: "fb",
        scopes: ["boards:read"],
        active: false,
        updatedAt: "2000-01-01T00:00:00.000Z",
      },
    ]);

    const req = new NextRequest(
      "http://localhost/api/admin/operations?orgId=org_a&provider=github&status=failed&tokenState=active"
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(listPushOutbox).toHaveBeenCalledWith({ limit: 50, orgId: "org_a" });
    expect(listIntegrationEventLogs).toHaveBeenCalledWith({ limit: 50, orgId: "org_a", provider: "github" });
    expect(json.integrationLogs.total).toBe(1);
    expect(json.publicApiTokens.total).toBe(1);
  });
});

