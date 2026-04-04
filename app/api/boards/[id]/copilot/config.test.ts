import { describe, expect, it } from "vitest";
import {
  COPILOT_SSE_HEADERS,
  COPILOT_USER_RATE_LIMIT,
  FREE_DEMO_MESSAGES_LIMIT,
  SSE_CHUNK_DELAY_MS,
  SSE_CHUNK_SIZE,
} from "./config";

describe("copilot config", () => {
  it("exposes stable rate limit values", () => {
    expect(COPILOT_USER_RATE_LIMIT.limit).toBe(10);
    expect(COPILOT_USER_RATE_LIMIT.windowMs).toBe(60 * 60 * 1000);
  });

  it("exposes SSE chunking defaults", () => {
    expect(SSE_CHUNK_SIZE).toBe(24);
    expect(SSE_CHUNK_DELAY_MS).toBe(12);
  });

  it("sets default free demo limit and headers", () => {
    expect(FREE_DEMO_MESSAGES_LIMIT).toBe(3);
    expect(COPILOT_SSE_HEADERS["Content-Type"]).toContain("text/event-stream");
    expect(COPILOT_SSE_HEADERS["Cache-Control"]).toBe("no-cache, no-transform");
    expect(COPILOT_SSE_HEADERS.Connection).toBe("keep-alive");
  });
});

