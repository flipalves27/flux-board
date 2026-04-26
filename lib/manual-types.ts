import type { FeatureKey } from "@/lib/plan-gates";

export type ManualLocale = "pt-BR" | "en";

export type ManualTocItem = {
  id: string;
  slug: string;
  order: number;
  parentId: string | null;
  tags: string[];
  /** Informativo na UI; não restringe leitura. */
  minTier?: "free" | "pro" | "business" | null;
  featureKeys?: FeatureKey[];
  title: Record<ManualLocale, string>;
  /** Página `plans` é gerada a partir de código, não ficheiro MD. */
  generated?: boolean;
};

export type ManualToc = { items: ManualTocItem[] };

export type ManualFrontmatter = {
  id: string;
  title?: string;
  excerpt?: string;
};

export type ManualArticle = {
  id: string;
  slug: string;
  locale: ManualLocale;
  title: string;
  bodyMd: string;
  excerpt: string;
  tags: string[];
};

export type ManualSearchRecord = {
  id: string;
  pageId: string;
  title: string;
  excerpt: string;
  slug: string;
  locale: ManualLocale;
  tags: string[];
  featureKeys?: FeatureKey[];
  /** Trecho para o índice Fuse. */
  searchText: string;
};

export type ManualChunk = {
  chunkId: string;
  pageId: string;
  locale: ManualLocale;
  slug: string;
  sectionTitle: string;
  text: string;
};
