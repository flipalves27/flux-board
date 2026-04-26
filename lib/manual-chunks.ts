import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { getManualToc, loadManualArticle } from "./manual-content";
import type { ManualArticle, ManualChunk, ManualLocale, ManualSearchRecord, ManualTocItem } from "./manual-types";
import { slugifyForChunk } from "./manual-faq";

const LOCALE_DIR: Record<ManualLocale, string> = { "pt-BR": "pt-BR", en: "en" };

const CONTENT = () => join(process.cwd(), "content", "manual");

/** Conteúdo do manual é estático no deploy — evita N leituras fs por pedido (Lambda cold / manual-ask RAG). */
const CACHE_CHUNKS = process.env.NODE_ENV === "production";
const searchRecordsCache: Partial<Record<ManualLocale, ManualSearchRecord[]>> = {};
const allChunksCache: Partial<Record<ManualLocale, ManualChunk[]>> = {};

function splitMarkdownToSections(
  pageId: string,
  locale: ManualLocale,
  slug: string,
  bodyMd: string
): ManualChunk[] {
  const lines = bodyMd.split(/\r?\n/);
  const out: ManualChunk[] = [];
  let buf: string[] = [];
  let section = "";

  const flush = () => {
    const t = buf.join("\n").trim();
    if (!t) return;
    const sid = section ? slugifyForChunk(section) : "body";
    out.push({
      chunkId: `${pageId}::${locale}::${sid}`,
      pageId,
      locale,
      slug,
      sectionTitle: section || "—",
      text: t,
    });
    buf = [];
  };

  for (const line of lines) {
    const m = /^(##+)\s+(.+)$/.exec(line);
    if (m && m[1]!.length === 2) {
      flush();
      section = m[2]!.trim();
      continue;
    }
    buf.push(line);
  }
  flush();
  return out;
}

function buildManualSearchRecordsForLocale(locale: ManualLocale): ManualSearchRecord[] {
  const toc = getManualToc();
  const out: ManualSearchRecord[] = [];
  for (const it of toc.items) {
    if (it.generated) {
      out.push({
        id: `page:${it.id}:${locale}`,
        pageId: it.id,
        title: it.title[locale],
        excerpt:
          locale === "en"
            ? "Reference table: plans, limits, and which tiers unlock each product feature (synced with code)."
            : "Tabela de referência: planos, limites e quais camadas desbloqueiam cada recurso (sincronizado com o código).",
        slug: it.slug,
        locale,
        tags: it.tags,
        featureKeys: it.featureKeys,
        searchText: `${it.title[locale]} ${it.tags.join(" ")} ${it.id} planos gating feature matrix reference`,
      });
      continue;
    }
    const art = loadManualArticle(it.slug, locale);
    if (!art) continue;
    const searchText = [art.title, art.excerpt, it.tags.join(" "), it.id, art.bodyMd.replace(/[#*_`>[\]]/g, " ")]
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    out.push({
      id: `page:${it.id}:${locale}`,
      pageId: it.id,
      title: art.title,
      excerpt: art.excerpt,
      slug: it.slug,
      locale,
      tags: it.tags,
      featureKeys: it.featureKeys,
      searchText,
    });
  }
  return out;
}

export function getManualSearchRecordsForLocale(locale: ManualLocale): ManualSearchRecord[] {
  if (CACHE_CHUNKS) {
    const hit = searchRecordsCache[locale];
    if (hit) return hit;
  }
  const built = buildManualSearchRecordsForLocale(locale);
  if (CACHE_CHUNKS) searchRecordsCache[locale] = built;
  return built;
}

function buildAllManualChunksForLocale(locale: ManualLocale): ManualChunk[] {
  const toc = getManualToc();
  const all: ManualChunk[] = [];
  for (const it of toc.items) {
    if (it.generated) {
      if (it.id === "plans") {
        const t =
          locale === "en"
            ? `Plans and feature gates. Organization tier may be free, pro, or business. See the matrix on this page.`
            : `Planos e regras de acesso. O tier da organização pode ser free, pro ou business. Veja a matriz nesta página.`;
        all.push({
          chunkId: `plans::${locale}::ref`,
          pageId: "plans",
          locale,
          slug: "plans",
          sectionTitle: "Reference",
          text: t,
        });
      }
      continue;
    }
    const art = loadManualArticle(it.slug, locale);
    if (!art) continue;
    const sections = splitMarkdownToSections(art.id, locale, it.slug, art.bodyMd);
    if (sections.length) all.push(...sections);
  }
  return all;
}

export function getAllManualChunksForLocale(locale: ManualLocale): ManualChunk[] {
  if (CACHE_CHUNKS) {
    const hit = allChunksCache[locale];
    if (hit) return hit;
  }
  const built = buildAllManualChunksForLocale(locale);
  if (CACHE_CHUNKS) allChunksCache[locale] = built;
  return built;
}

/** Lista ficheiros `.md` (debug / scripts). */
export function listLocaleManualSlugs(locale: ManualLocale): string[] {
  const dir = join(CONTENT(), LOCALE_DIR[locale]);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

/**
 * `loadedArticle` evita 2× `readFile` na mesma RSC (page já chamou `loadManualArticle` para o artigo em destaque).
 */
export function getPrefillTextForPage(
  page: ManualTocItem | null,
  locale: ManualLocale,
  loadedArticle?: ManualArticle | null
): string {
  if (!page) {
    return locale === "en"
      ? "Browse topics on the left or ask Fluxy about the product manual."
      : "Navegue pelos tópicos à esquerda ou peça informações à Fluxy sobre o manual do produto.";
  }
  if (page.id === "plans") {
    return locale === "en"
      ? "This page lists numeric limits and the feature matrix (tiers) used by the app — the same data as in billing code."
      : "Esta página mostra limites numéricos e a matriz de recursos (tiers) usada na app — os mesmos dados do código de billing.";
  }
  if (page.generated) {
    return page.title[locale];
  }
  const art =
    loadedArticle && loadedArticle.slug === page.slug
      ? loadedArticle
      : loadManualArticle(page.slug, locale);
  if (!art) {
    return page.title[locale];
  }
  const sections = splitMarkdownToSections(art.id, locale, page.slug, art.bodyMd);
  const t = sections[0]?.text?.trim() ?? "";
  if (!t) return page.title[locale];
  return t.length > 280 ? t.slice(0, 277) + "…" : t;
}
