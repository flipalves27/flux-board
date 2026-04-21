import { createHmac } from "node:crypto";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { verifySlackRequestSignature } from "./slack-request-verify";

function slackSignature(secret: string, ts: string, body: string): string {
  const base = `v0:${ts}:${body}`;
  const hmac = createHmac("sha256", secret).update(base).digest("hex");
  return `v0=${hmac}`;
}

describe("verifySlackRequestSignature", () => {
  const secret = "test_slack_signing_secret";
  const body = "command=%2Fflux&text=status";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts a valid signature", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = slackSignature(secret, ts, body);
    expect(
      verifySlackRequestSignature({
        signingSecret: secret,
        rawBody: body,
        timestampHeader: ts,
        signatureHeader: sig,
      })
    ).toBe(true);
  });

  it("rejects wrong secret", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = slackSignature(secret, ts, body);
    expect(
      verifySlackRequestSignature({
        signingSecret: "other",
        rawBody: body,
        timestampHeader: ts,
        signatureHeader: sig,
      })
    ).toBe(false);
  });

  it("rejects stale timestamp", () => {
    const oldTs = String(Math.floor(Date.now() / 1000) - 600);
    const sig = slackSignature(secret, oldTs, body);
    expect(
      verifySlackRequestSignature({
        signingSecret: secret,
        rawBody: body,
        timestampHeader: oldTs,
        signatureHeader: sig,
        maxSkewSec: 300,
      })
    ).toBe(false);
  });

  it("rejects missing headers", () => {
    expect(
      verifySlackRequestSignature({
        signingSecret: secret,
        rawBody: body,
        timestampHeader: null,
        signatureHeader: "v0=abc",
      })
    ).toBe(false);
  });
});
