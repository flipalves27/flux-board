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
    expect(cardMatchesFilters(c, "all", new Set(), "")).toBe(true);
    expect(cardMatchesFilters(c, "Urgente", new Set(), "")).toBe(true);
    expect(cardMatchesFilters(c, "Importante", new Set(), "")).toBe(false);
  });

  it("requires any active label to match card tags", () => {
    const c = baseCard({ tags: ["A", "B"] });
    expect(cardMatchesFilters(c, "all", new Set(["A"]), "")).toBe(true);
    expect(cardMatchesFilters(c, "all", new Set(["Z"]), "")).toBe(false);
  });

  it("matches search in title, id, desc, and tags", () => {
    expect(cardMatchesFilters(baseCard({ title: "Alpha" }), "all", new Set(), "alp")).toBe(true);
    expect(cardMatchesFilters(baseCard({ id: "XYZ-99" }), "all", new Set(), "xyz")).toBe(true);
    expect(cardMatchesFilters(baseCard({ desc: "notes HERE" }), "all", new Set(), "here")).toBe(true);
    expect(cardMatchesFilters(baseCard({ tags: ["Portal"] }), "all", new Set(), "port")).toBe(true);
  });

  it("restricts to nlq id set when provided", () => {
    const c = baseCard({ id: "keep" });
    expect(cardMatchesFilters(c, "all", new Set(), "", null)).toBe(true);
    expect(cardMatchesFilters(c, "all", new Set(), "", new Set(["keep"]))).toBe(true);
    expect(cardMatchesFilters(c, "all", new Set(), "", new Set(["other"]))).toBe(false);
  });
});
