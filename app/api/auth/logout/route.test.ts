import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { REFRESH_COOKIE } from "@/lib/auth-cookie-names";
import { POST } from "./route";

vi.mock("@/lib/kv-refresh-sessions", () => ({
  revokeRefreshToken: vi.fn(),
}));

vi.mock("@/lib/session-cookies", () => ({
  clearAuthCookiesOnNextResponse: vi.fn(),
}));

import { revokeRefreshToken } from "@/lib/kv-refresh-sessions";
import { clearAuthCookiesOnNextResponse } from "@/lib/session-cookies";

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    vi.mocked(revokeRefreshToken).mockReset();
    vi.mocked(clearAuthCookiesOnNextResponse).mockReset();
  });

  it("clears cookies and revokes refresh when cookie present", async () => {
    const req = new NextRequest("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { cookie: `${REFRESH_COOKIE}=tok` },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(revokeRefreshToken).toHaveBeenCalledWith("tok");
    expect(clearAuthCookiesOnNextResponse).toHaveBeenCalled();
  });

  it("still clears cookies when refresh cookie missing", async () => {
    const req = new NextRequest("http://localhost/api/auth/logout", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(revokeRefreshToken).not.toHaveBeenCalled();
    expect(clearAuthCookiesOnNextResponse).toHaveBeenCalled();
  });
});
