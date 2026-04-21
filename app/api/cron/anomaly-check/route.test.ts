import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/mongo", () => ({
  isMongoConfigured: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 })),
}));

vi.mock("@/lib/anomaly-service", () => ({
  runAnomalyCheckAllOrgs: vi.fn(),
}));

vi.mock("@/lib/cron-secret", () => ({
  verifyCronSecret: vi.fn(),
}));

import { GET } from "./route";
import { verifyCronSecret } from "@/lib/cron-secret";
import { isMongoConfigured } from "@/lib/mongo";

describe("GET /api/cron/anomaly-check", () => {
  beforeEach(() => {
    vi.mocked(verifyCronSecret).mockReset();
    vi.mocked(isMongoConfigured).mockReset();
  });

  it("returns 401 when cron secret verification fails", async () => {
    vi.mocked(verifyCronSecret).mockReturnValue(false);
    const res = await GET(new NextRequest("http://localhost/api/cron/anomaly-check"));
    expect(res.status).toBe(401);
  });

  it("returns 501 when mongo is not configured", async () => {
    vi.mocked(verifyCronSecret).mockReturnValue(true);
    vi.mocked(isMongoConfigured).mockReturnValue(false);
    const res = await GET(new NextRequest("http://localhost/api/cron/anomaly-check"));
    expect(res.status).toBe(501);
  });
});
