import { describe, expect, it } from "vitest";
import { parseDeliveryScenarioNl } from "./delivery-scenario-nl";

describe("parseDeliveryScenarioNl", () => {
  it("parses remove count", () => {
    const r = parseDeliveryScenarioNl("remover 5 itens do escopo");
    expect(r.removeItems).toBe(5);
  });

  it("parses capacity", () => {
    const r = parseDeliveryScenarioNl("120% mais capacidade");
    expect(r.capacityMultiplier).toBe(1.2);
  });
});
