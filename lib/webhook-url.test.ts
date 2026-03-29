/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { lookup } from "node:dns/promises";
import {
  assertWebhookUrlAllowed,
  assertWebhookUrlResolvesSafely,
  WebhookUrlBlockedError,
} from "./webhook-url";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(),
}));

const mockedLookup = vi.mocked(lookup);

describe("assertWebhookUrlAllowed", () => {
  it("aceita HTTPS com hostname público (sintaxe)", () => {
    expect(() => assertWebhookUrlAllowed("https://hooks.example.com/path")).not.toThrow();
  });

  it("aceita HTTP apenas em localhost", () => {
    expect(() => assertWebhookUrlAllowed("http://localhost:3000/hook")).not.toThrow();
    expect(() => assertWebhookUrlAllowed("http://127.0.0.1/hook")).not.toThrow();
  });

  it("rejeita HTTP fora de localhost", () => {
    expect(() => assertWebhookUrlAllowed("http://hooks.example.com/x")).toThrow(WebhookUrlBlockedError);
  });

  it("rejeita IP privado literal", () => {
    expect(() => assertWebhookUrlAllowed("https://192.168.1.1/x")).toThrow(WebhookUrlBlockedError);
    expect(() => assertWebhookUrlAllowed("https://10.0.0.1/x")).toThrow(WebhookUrlBlockedError);
  });

  it("rejeita credenciais no URL", () => {
    expect(() => assertWebhookUrlAllowed("https://user:pass@example.com/hook")).toThrow(WebhookUrlBlockedError);
  });

  it("rejeita metadata.google.internal", () => {
    expect(() => assertWebhookUrlAllowed("https://metadata.google.internal/x")).toThrow(WebhookUrlBlockedError);
  });
});

describe("assertWebhookUrlResolvesSafely", () => {
  beforeEach(() => {
    mockedLookup.mockReset();
  });

  it("não consulta DNS para localhost", async () => {
    await expect(assertWebhookUrlResolvesSafely("http://127.0.0.1/hook")).resolves.toBeUndefined();
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it("rejeita quando DNS resolve para IP privado", async () => {
    mockedLookup.mockResolvedValueOnce([{ address: "192.168.4.5", family: 4 }]);
    await expect(assertWebhookUrlResolvesSafely("https://fake-public.example/hook")).rejects.toThrow(
      WebhookUrlBlockedError
    );
  });

  it("aceita quando DNS resolve para IP público", async () => {
    mockedLookup.mockResolvedValueOnce([{ address: "203.0.113.10", family: 4 }]);
    await expect(assertWebhookUrlResolvesSafely("https://fake-public.example/hook")).resolves.toBeUndefined();
  });

  it("rejeita se algum AAAA é privado", async () => {
    mockedLookup.mockResolvedValueOnce([
      { address: "203.0.113.10", family: 4 },
      { address: "fd00::1", family: 6 },
    ]);
    await expect(assertWebhookUrlResolvesSafely("https://fake-public.example/hook")).rejects.toThrow(
      WebhookUrlBlockedError
    );
  });
});
