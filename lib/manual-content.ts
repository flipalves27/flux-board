import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { ManualArticle, ManualLocale, ManualToc, ManualTocItem } from "./manual-types";
import { buildManualTocTree } from "./manual-toc-build";

const CONTENT_ROOT = () => join(process.cwd(), "content", "manual");

const LOCALE_DIR: Record<ManualLocale, string> = { "pt-BR": "pt-BR", en: "en" };

function readTocRaw(): ManualToc {
  const p = join(CONTENT_ROOT(), "toc.json");
  const raw = readFileSync(p, "utf-8");
  return JSON.parse(raw) as ManualToc;
}

let cachedToc: ManualToc | null = null;

export function getManualToc(): ManualToc {
  if (cachedToc) return cachedToc;
  cachedToc = readTocRaw();
  return cachedToc;
}

export function getTocItemBySlug(slug: string): ManualTocItem | undefined {
  return getManualToc().items.find((i) => i.slug === slug);
}

function parseFrontmatter(
  source: string
): { fm: Record<string, unknown> | null; body: string } {
  if (!source.startsWith("---\n") && !source.startsWith("---\r\n")) {
    return { fm: null, body: source };
  }
  const n = source.indexOf("\n---\n", 3);
  const w = source.indexOf("\n---\r\n", 3);
  const end = n >= 0 ? n : w;
  if (end < 0) return { fm: null, body: source };
  const yamlBlock = source.slice(3, end).trim();
  const body = source.slice(end + (n >= 0 ? 5 : 6)).replace(/^\n/, "");
  const fm: Record<string, unknown> = {};
  for (const line of yamlBlock.split("\n")) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (m) fm[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
  return { fm, body };
}

function excerptFromBody(md: string, max = 200): string {
  const t = md.replace(/^#+\s+.*\n+/, "").trim();
  const line = t.split("\n").find((l) => l.trim() && !l.trim().startsWith("#"))?.trim() ?? t.slice(0, max);
  if (line.length <= max) return line;
  return line.slice(0, max - 1).trimEnd() + "…";
}

function articlePathlocale(locale: ManualLocale, slug: string): string {
  return join(CONTENT_ROOT(), LOCALE_DIR[locale], `${slug}.md`);
}

export function loadManualArticle(slug: string, locale: ManualLocale): ManualArticle | null {
  const it = getTocItemBySlug(slug);
  if (!it || it.generated) return null;
  const p = articlePathlocale(locale, slug);
  if (!existsSync(p)) {
    return null;
  }
  const raw = readFileSync(p, "utf-8");
  const { fm, body } = parseFrontmatter(raw);
  const id = (fm?.id as string) ?? it.id;
  const tRaw = typeof fm?.title === "string" ? fm.title.trim() : "";
  const title = tRaw || it.title[locale];
  return {
    id,
    slug,
    locale,
    title,
    bodyMd: body,
    excerpt: (fm?.excerpt as string) || excerptFromBody(body),
    tags: it.tags,
  };
}

export function getOrderedTocTree(): { roots: ManualTocItem[]; byParent: Map<string | null, ManualTocItem[]> } {
  return buildManualTocTree(getManualToc());
}
