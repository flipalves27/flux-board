import { createHmac } from "node:crypto";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

function slackSig(secret: string, ts: string, rawBody: string): string {
  const base = `v0:${ts}:${rawBody}`;
  return `v0=${createHmac("sha256", secret).update(base).digest("hex")}`;
}

describe("POST /api/integrations/slack/commands", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-01T12:00:00.000Z"));
    process.env = { ...prev };
  });

  afterEach(() => {
    process.env = { ...prev };
    vi.useRealTimers();
    vi.resetModules();
  });

  it("returns 404 when SLACK_SIGNING_SECRET is unset", async () => {
    delete process.env.SLACK_SIGNING_SECRET;
    const { POST } = await import("./route");
    const req = new NextRequest("http://localhost/api/integrations/slack/commands", {
      method: "POST",
      body: "command=%2Fflux&text=status",
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("returns 401 when signature is invalid", async () => {
    process.env.SLACK_SIGNING_SECRET = "slack_signing_secret_test_value_32b";
    const { POST } = await import("./route");
    const body = "command=%2Fflux&text=status";
    const req = new NextRequest("http://localhost/api/integrations/slack/commands", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-slack-request-timestamp": String(Math.floor(Date.now() / 1000)),
        "x-slack-signature": "v0=deadbeef",
      },
      body,
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns JSON for valid slash command when secret configured", async () => {
    process.env.SLACK_SIGNING_SECRET = "slack_signing_secret_test_value_32b";
    const { POST } = await import("./route");
    const body = "command=%2Fflux&text=status";
    const ts = String(Math.floor(Date.now() / 1000));
    const req = new NextRequest("http://localhost/api/integrations/slack/commands", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-slack-request-timestamp": ts,
        "x-slack-signature": slackSig("slack_signing_secret_test_value_32b", ts, body),
      },
      body,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const j = (await res.json()) as { text: string };
    expect(j.text).toMatch(/status/i);
  });
});
