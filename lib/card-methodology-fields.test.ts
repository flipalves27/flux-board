import { describe, expect, it } from "vitest";
import { CardDataSchema, STORY_POINTS_FIBONACCI } from "./schemas";

describe("card methodology fields", () => {
  it("accepts valid storyPoints and serviceClass", () => {
    const base = {
      id: "c1",
      bucket: "backlog",
      priority: "Média",
      progress: "Não iniciado",
      title: "T",
      desc: "",
      order: 0,
      storyPoints: 5 as const,
      serviceClass: "standard" as const,
    };
    const r = CardDataSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it("rejects invalid storyPoints", () => {
    const base = {
      id: "c1",
      bucket: "backlog",
      priority: "Média",
      progress: "Não iniciado",
      title: "T",
      desc: "",
      order: 0,
      storyPoints: 4,
    };
    const r = CardDataSchema.safeParse(base);
    expect(r.success).toBe(false);
  });

  it("Fibonacci list includes common planning values", () => {
    expect(STORY_POINTS_FIBONACCI).toContain(8);
    expect(STORY_POINTS_FIBONACCI).toContain(13);
  });
});
