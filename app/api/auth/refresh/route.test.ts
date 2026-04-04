import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { REFRESH_COOKIE } from "@/lib/auth-cookie-names";
import { POST } from "./route";

vi.mock("@/lib/server-session", () => ({
  rotateSessionFromRefreshPlain: vi.fn(),
}));

vi.mock("@/lib/session-cookies", () => ({
  clearAuthCookiesOnNextResponse: vi.fn(),
  setAuthCookiesOnNextResponse: vi.fn(),
}));

import { rotateSessionFromRefreshPlain } from "@/lib/server-session";
import { clearAuthCookiesOnNextResponse, setAuthCookiesOnNextResponse } from "@/lib/session-cookies";

describe("POST /api/auth/refresh", () => {
  beforeEach(() => {
    vi.mocked(rotateSessionFromRefreshPlain).mockReset();
    vi.mocked(clearAuthCookiesOnNextResponse).mockReset();
    vi.mocked(setAuthCookiesOnNextResponse).mockReset();
  });

  it("returns 401 when refresh cookie is missing", async () => {
    const req = new NextRequest("http://localhost/api/auth/refresh", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 when rotation fails", async () => {
    vi.mocked(rotateSessionFromRefreshPlain).mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/auth/refresh", {
      method: "POST",
      headers: { cookie: `${REFRESH_COOKIE}=opaque` },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(clearAuthCookiesOnNextResponse).toHaveBeenCalledWith(expect.any(Object));
  });

  it("returns 200 and sets cookies when rotation succeeds", async () => {
    vi.mocked(rotateSessionFromRefreshPlain).mockResolvedValue({
      access: "access-jwt",
      refreshPlain: "new-refresh",
      persistent: true,
      user: {
        id: "u1",
        username: "tester",
        orgId: "org1",
        isAdmin: false,
        isExecutive: false,
      },
    });
    const req = new NextRequest("http://localhost/api/auth/refresh", {
      method: "POST",
      headers: { cookie: `${REFRESH_COOKIE}=old` },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(setAuthCookiesOnNextResponse).toHaveBeenCalledWith(
      expect.any(Object),
      "access-jwt",
      "new-refresh",
      true
    );
  });
});
