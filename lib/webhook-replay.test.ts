import { beforeEach, describe, expect, it } from "vitest";
import { consumeWebhookDelivery } from "./webhook-replay";

describe("consumeWebhookDelivery", () => {
  beforeEach(async () => {
    // best-effort key uniqueness by delivery id in tests
  });

  it("rejects missing delivery ids", async () => {
    const first = await consumeWebhookDelivery({ provider: "github", deliveryId: null });
    expect(first.accepted).toBe(false);
    expect(first.reason).toBe("missing_delivery_id");
  });

  it("accepts first delivery and blocks replay", async () => {
    const first = await consumeWebhookDelivery({ provider: "github", deliveryId: "d_123", ttlSeconds: 3600 });
    const second = await consumeWebhookDelivery({ provider: "github", deliveryId: "d_123", ttlSeconds: 3600 });
    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(false);
    expect(second.reason).toBe("replay_detected");
  });
});

