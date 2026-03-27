import { describe, expect, it } from "vitest";
import {
  parseDescriptionToBlocks,
  serializeDescriptionBlocks,
  createEmptyDescriptionBlocks,
} from "@/components/kanban/description-blocks";

describe("description-blocks", () => {
  it("roundtrips plain structured sections", () => {
    const blocks = createEmptyDescriptionBlocks();
    blocks.businessContext = "Line one\nLine two";
    blocks.objective = "Ship the feature";
    const raw = serializeDescriptionBlocks(blocks);
    const again = parseDescriptionToBlocks(raw);
    expect(again.businessContext.trim()).toBe(blocks.businessContext.trim());
    expect(again.objective.trim()).toBe(blocks.objective.trim());
  });

  it("roundtrips markdown-style content in sections", () => {
    const blocks = createEmptyDescriptionBlocks();
    blocks.businessContext = "## Situação\n\n- Item **A**\n- Item B";
    blocks.notes = "`code` and [link](https://example.com)";
    const raw = serializeDescriptionBlocks(blocks);
    const again = parseDescriptionToBlocks(raw);
    expect(again.businessContext.trim()).toBe(blocks.businessContext.trim());
    expect(again.notes.trim()).toBe(blocks.notes.trim());
  });

  it("does not split fake headings inside fenced code blocks", () => {
    const md = [
      "Contexto/Negocio:",
      "```",
      "Objetivo: this should stay in context",
      "Escopo: same here",
      "```",
      "",
      "Objetivo:",
      "Real objective body",
    ].join("\n");
    const blocks = parseDescriptionToBlocks(md);
    expect(blocks.businessContext).toContain("Objetivo: this should stay in context");
    expect(blocks.objective.trim()).toBe("Real objective body");
  });

  it("maps legacy unstructured text to businessContext", () => {
    const raw = "Just a freeform description without section headers.";
    const blocks = parseDescriptionToBlocks(raw);
    expect(blocks.businessContext.trim()).toBe(raw);
  });
});
