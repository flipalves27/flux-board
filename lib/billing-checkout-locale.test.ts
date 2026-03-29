import { describe, expect, it } from "vitest";

import { resolveCheckoutLocale } from "./billing";

describe("resolveCheckoutLocale", () => {
  it("returns default for invalid or missing locale", () => {
    expect(resolveCheckoutLocale(undefined)).toBe("pt-BR");
    expect(resolveCheckoutLocale("")).toBe("pt-BR");
    expect(resolveCheckoutLocale("fr")).toBe("pt-BR");
  });

  it("accepts configured locales", () => {
    expect(resolveCheckoutLocale("en")).toBe("en");
    expect(resolveCheckoutLocale("pt-BR")).toBe("pt-BR");
  });
});
