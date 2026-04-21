import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

vi.mock("@/lib/billing", () => ({
  handleStripeWebhook: vi.fn(),
}));

import { handleStripeWebhook } from "@/lib/billing";

describe("POST /api/billing/webhook", () => {
  beforeEach(() => {
    vi.mocked(handleStripeWebhook).mockReset();
  });

  it("returns 200 with handled true on success", async () => {
    vi.mocked(handleStripeWebhook).mockResolvedValue({ handled: true, status: 200 });
    const req = new NextRequest("http://localhost/api/billing/webhook", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const j = (await res.json()) as { received: boolean; handled: boolean };
    expect(j.received).toBe(true);
    expect(j.handled).toBe(true);
  });

  it("returns 200 with handled false when handler throws", async () => {
    vi.mocked(handleStripeWebhook).mockRejectedValue(new Error("sig"));
    const req = new NextRequest("http://localhost/api/billing/webhook", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const j = (await res.json()) as { received: boolean; handled: boolean };
    expect(j.handled).toBe(false);
  });
});
