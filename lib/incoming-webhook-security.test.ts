import { describe, expect, it } from "vitest";
import { buildIncomingWebhookSignature, verifyIncomingWebhookSignature } from "./incoming-webhook-security";

describe("incoming-webhook-security", () => {
  it("validates HMAC signature with timestamp", () => {
    const secret = "webhook-secret";
    const payload = JSON.stringify({ hello: "world" });
    const ts = String(Date.now());
    const sig = buildIncomingWebhookSignature(payload, ts, secret);
    const result = verifyIncomingWebhookSignature({ payload, timestamp: ts, signature: sig, secret });
    expect(result.ok).toBe(true);
  });

  it("rejects invalid signature", () => {
    const result = verifyIncomingWebhookSignature({
      payload: "{}",
      timestamp: String(Date.now()),
      signature: "bad",
      secret: "abc",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("invalid_signature");
  });
});
