import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ManualTocItem } from "./manual-types";
import * as manualContent from "./manual-content";
import { getPrefillTextForPage, getAllManualChunksForLocale } from "./manual-chunks";

const introToc: ManualTocItem = {
  id: "intro",
  slug: "intro",
  order: 0,
  parentId: null,
  tags: ["getting-started"],
  title: {
    "pt-BR": "Bem-vindo ao manual do produto",
    en: "Welcome to the product manual",
  },
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("getPrefillTextForPage", () => {
  it("com artigo em memória não volata a chamar loadManualArticle", () => {
    const spy = vi.spyOn(manualContent, "loadManualArticle");
    const loaded = {
      id: "intro",
      slug: "intro",
      locale: "pt-BR" as const,
      title: "T",
      bodyMd: "Parágrafo de abertura.\n\n## Secundário\nMais conteúdo",
      excerpt: "e",
      tags: [] as string[],
    };
    const out = getPrefillTextForPage(introToc, "pt-BR", loaded);
    expect(spy).not.toHaveBeenCalled();
    expect(out).toBe("Parágrafo de abertura.");
  });

  it("página plans devolve copy fixa", () => {
    const plans: ManualTocItem = {
      id: "plans",
      slug: "plans",
      order: 1,
      parentId: null,
      tags: [],
      title: { "pt-BR": "Planos", en: "Plans" },
      generated: true,
    };
    const en = getPrefillTextForPage(plans, "en");
    expect(en).toContain("numeric limits");
    const spy = vi.spyOn(manualContent, "loadManualArticle");
    expect(getPrefillTextForPage(plans, "en")).toBe(en);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("getAllManualChunksForLocale (integração mínima)", () => {
  it("com content/manual no repo, pt-BR tem chunks intro", () => {
    const chunks = getAllManualChunksForLocale("pt-BR");
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.some((c) => c.slug === "intro")).toBe(true);
  });
});
