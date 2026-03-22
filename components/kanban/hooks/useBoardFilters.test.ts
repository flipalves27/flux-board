import { describe, expect, it } from "vitest";
import type { CardData } from "@/app/board/[id]/page";
import { cardMatchesFilters } from "./useBoardFilters";

const baseCard = (over: Partial<CardData>): CardData => ({
  id: "c1",
  bucket: "Backlog",
  priority: "Média",
  progress: "Não iniciado",
  title: "Hello",
  desc: "",
  tags: [],
  direction: null,
  dueDate: null,
  order: 0,
  ...over,
});

describe("cardMatchesFilters", () => {
  it("filters by priority when not all", () => {
    const c = baseCard({ priority: "Urgente" });
    expect(cardMatchesFilters(c, "all", new Set(), "", null, null, null)).toBe(true);
    expect(cardMatchesFilters(c, "Urgente", new Set(), "", null, null, null)).toBe(true);
    expect(cardMatchesFilters(c, "Importante", new Set(), "", null, null, null)).toBe(false);
  });

  it("requires any active label to match card tags", () => {
    const c = baseCard({ tags: ["A", "B"] });
    expect(cardMatchesFilters(c, "all", new Set(["A"]), "", null, null, null)).toBe(true);
    expect(cardMatchesFilters(c, "all", new Set(["Z"]), "", null, null, null)).toBe(false);
  });

  it("matches search in title, id, desc, and tags", () => {
    expect(cardMatchesFilters(baseCard({ title: "Alpha" }), "all", new Set(), "alp", null, null, null)).toBe(true);
    expect(cardMatchesFilters(baseCard({ id: "XYZ-99" }), "all", new Set(), "xyz", null, null, null)).toBe(true);
    expect(cardMatchesFilters(baseCard({ desc: "notes HERE" }), "all", new Set(), "here", null, null, null)).toBe(
      true
    );
    expect(cardMatchesFilters(baseCard({ tags: ["Portal"] }), "all", new Set(), "port", null, null, null)).toBe(
      true
    );
  });

  it("restricts to nlq id set when provided", () => {
    const c = baseCard({ id: "keep" });
    expect(cardMatchesFilters(c, "all", new Set(), "", null, null, null)).toBe(true);
    expect(cardMatchesFilters(c, "all", new Set(), "", new Set(["keep"]), null, null)).toBe(true);
    expect(cardMatchesFilters(c, "all", new Set(), "", new Set(["other"]), null, null)).toBe(false);
  });

  it("restricts to sprint card id set when provided", () => {
    const c = baseCard({ id: "s1" });
    expect(cardMatchesFilters(c, "all", new Set(), "", null, null, null)).toBe(true);
    expect(cardMatchesFilters(c, "all", new Set(), "", null, new Set(["s1"]), null)).toBe(true);
    expect(cardMatchesFilters(c, "all", new Set(), "", null, new Set(["other"]), null)).toBe(false);
  });

  it("applies sprint filter before nlq filter", () => {
    const c = baseCard({ id: "x" });
    expect(cardMatchesFilters(c, "all", new Set(), "", new Set(["x"]), new Set(["y"]), null)).toBe(false);
    expect(cardMatchesFilters(c, "all", new Set(), "", new Set(["x"]), new Set(["x"]), null)).toBe(true);
  });

  it("restricts to insight focus card ids when non-empty set is provided", () => {
    const c = baseCard({ id: "a" });
    expect(cardMatchesFilters(c, "all", new Set(), "", null, null, null)).toBe(true);
    expect(cardMatchesFilters(c, "all", new Set(), "", null, null, new Set(["a"]))).toBe(true);
    expect(cardMatchesFilters(c, "all", new Set(), "", null, null, new Set(["b"]))).toBe(false);
  });
});
