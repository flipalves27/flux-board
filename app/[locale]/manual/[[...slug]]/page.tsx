import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ManualApp } from "@/components/manual/manual-app";
import { getPrefillTextForPage } from "@/lib/manual-chunks";
import { getTocItemBySlug, getManualToc, loadManualArticle } from "@/lib/manual-content";
import { getDerivedPlansSnapshot } from "@/lib/manual-plans-derive";
import type { ManualLocale } from "@/lib/manual-types";

type Props = { params: Promise<{ locale: string; slug?: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: loc, slug: raw } = await params;
  const locale: ManualLocale = loc === "en" ? "en" : "pt-BR";
  const segs = raw?.filter(Boolean) ?? [];
  const s = (segs[0] || "intro").toLowerCase();
  const item = getTocItemBySlug(s);
  const titleBase = locale === "en" ? "Product manual" : "Manual do produto";
  if (!item) return { title: titleBase };
  return { title: `${item.title[locale]} — ${titleBase}` };
}

export default async function ManualPage({ params }: Props) {
  const { locale: loc, slug: raw } = await params;
  const locale: ManualLocale = loc === "en" ? "en" : "pt-BR";
  const segs = raw?.filter(Boolean) ?? [];
  if (segs.length > 1) notFound();
  const s = (segs[0] || "intro").toLowerCase();
  const item = getTocItemBySlug(s);
  if (!item) notFound();
  const toc = getManualToc();
  if (item.generated) {
    const prefill = getPrefillTextForPage(item, locale);
    return (
      <ManualApp
        locale={locale}
        slug={s}
        toc={toc}
        pageId={item.id}
        prefill={prefill}
        article={null}
        plansSnapshot={getDerivedPlansSnapshot(locale)}
      />
    );
  }
  const art = loadManualArticle(s, locale);
  if (!art) notFound();
  const prefill = getPrefillTextForPage(item, locale);
  return (
    <ManualApp
      locale={locale}
      slug={s}
      toc={toc}
      pageId={item.id}
      prefill={prefill}
      article={art}
      plansSnapshot={null}
    />
  );
}
