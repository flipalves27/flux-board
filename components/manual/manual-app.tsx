"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import Fuse from "fuse.js";
import { Header } from "@/components/header";
import { DocsMarkdownPreview } from "@/components/docs/docs-markdown-preview";
import { useOrgBranding } from "@/context/org-branding-context";
import { FluxyAvatar } from "@/components/fluxy/fluxy-avatar";
import { FluxySpeechBubble } from "@/components/fluxy/fluxy-speech-bubble";
import type { ManualLocale, ManualArticle, ManualToc, ManualTocItem } from "@/lib/manual-types";
import type { ManualPlansSnapshot } from "@/lib/manual-plans-derive";
import { buildManualTocTree } from "@/lib/manual-toc-build";
import type { ManualSearchRecord } from "@/lib/manual-types";
import { useAuth } from "@/context/auth-context";

type PlansSnap = ManualPlansSnapshot;

type Line = { id: string; role: "user" | "assistant"; text: string };

type Props = {
  locale: ManualLocale;
  slug: string;
  pageId: string;
  toc: ManualToc;
  prefill: string;
  article: ManualArticle | null;
  plansSnapshot: PlansSnap | null;
};

type FluxyViz = "idle" | "thinking" | "talking" | "error";

function minTierRank(m: NonNullable<ManualTocItem["minTier"]>): number {
  if (m === "pro") return 1;
  if (m === "business") return 2;
  return 0;
}

function orgTierRank(
  org: { plan: string; trialEndsAt?: string | null; downgradeGraceEndsAt?: string | null; downgradeFromTier?: string | null } | null
): number {
  if (!org) return 0;
  if (org.plan === "business") return 2;
  if (org.plan === "pro") return 1;
  if (org.plan === "trial" && org.trialEndsAt) {
    const t = new Date(org.trialEndsAt).getTime();
    if (Number.isFinite(t) && t > Date.now()) return 1;
  }
  if (org.downgradeGraceEndsAt) {
    const g = new Date(org.downgradeGraceEndsAt).getTime();
    if (Number.isFinite(g) && g > Date.now()) {
      if (org.downgradeFromTier === "business") return 2;
      if (org.downgradeFromTier === "pro") return 1;
    }
  }
  return 0;
}

export function ManualApp(props: Props) {
  const { locale, slug, pageId, toc, prefill, article, plansSnapshot } = props;
  const t = useTranslations("manualApp");
  const localeFromHook = useLocale();
  const localeRoot = `/${localeFromHook}`;
  const { org } = useOrgBranding() ?? { org: null };
  const userRank = useMemo(() => orgTierRank(org), [org]);
  const { getHeaders, isChecked } = useAuth();
  const path = usePathname();
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string>("__all__");
  const [myPlanOnly, setMyPlanOnly] = useState(false);
  const [indexRows, setIndexRows] = useState<ManualSearchRecord[] | null>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [lines, setLines] = useState<Line[]>([{ id: "i0", role: "assistant", text: prefill }]);
  const [draft, setDraft] = useState("");
  const [fluxy, setFluxy] = useState<FluxyViz>("idle");
  const endRef = useRef<HTMLDivElement | null>(null);

  const { roots, byParent } = useMemo(() => buildManualTocTree(toc), [toc]);

  const tags = useMemo(() => {
    const s = new Set<string>();
    for (const it of toc.items) for (const g of it.tags) s.add(g);
    return [...s].sort();
  }, [toc.items]);

  const fuse = useMemo(() => {
    if (!indexRows?.length) return null;
    return new Fuse(indexRows, {
      keys: [
        { name: "title", weight: 0.4 },
        { name: "searchText", weight: 0.45 },
        { name: "tags", weight: 0.15 },
      ],
      threshold: 0.42,
      ignoreLocation: true,
      minMatchCharLength: 1,
    });
  }, [indexRows]);

  useEffect(() => {
    if (!isChecked) return;
    let c = true;
    void (async () => {
      const res = await fetch(`/api/help/manual-index?locale=${encodeURIComponent(locale)}`, { headers: getHeaders() });
      if (!c || !res.ok) return;
      const data = (await res.json()) as { items?: ManualSearchRecord[] };
      if (data.items) setIndexRows(data.items);
    })();
    return () => {
      c = false;
    };
  }, [getHeaders, isChecked, locale]);

  useEffect(() => {
    setLines([{ id: `i-${pageId}-${path}`, role: "assistant", text: prefill }]);
  }, [path, prefill, pageId]);

  const filterRow = useCallback(
    (r: ManualSearchRecord) => {
      if (myPlanOnly) {
        const it = toc.items.find((x) => x.id === r.pageId);
        if (it?.minTier && minTierRank(it.minTier) > userRank) return false;
      }
      if (tag && tag !== "__all__" && !r.tags.includes(tag)) return false;
      return true;
    },
    [myPlanOnly, tag, toc.items, userRank]
  );

  const searchHits = useMemo(() => {
    if (!indexRows) return [] as ManualSearchRecord[];
    const list = (() => {
      if (!q.trim() || !fuse) return indexRows;
      return fuse.search(q, { limit: 24 }).map((x) => x.item);
    })();
    return list.filter(filterRow);
  }, [q, fuse, indexRows, filterRow]);

  const onAsk = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const msg = draft.trim();
      if (!msg) return;
      setLines((L) => [...L, { id: `u:${Date.now()}`, role: "user", text: msg }]);
      setDraft("");
      setFluxy("thinking");
      const res = await fetch("/api/help/manual-ask", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getHeaders() },
        body: JSON.stringify({ locale, pageId, message: msg }),
      });
      const data = (await res.json().catch(() => ({}))) as { reply?: string; error?: string; source?: string };
      if (!res.ok) {
        setLines((L) => [...L, { id: `a:${Date.now()}`, role: "assistant", text: data.error ?? "—" }]);
        setFluxy("error");
        return;
      }
      setLines((L) => [
        ...L,
        { id: `a:${Date.now()}`, role: "assistant", text: String(data.reply ?? "").trim() || "—" },
      ]);
      setFluxy("idle");
    },
    [draft, getHeaders, locale, pageId]
  );

  useEffect(() => {
    if (!lines.length) return;
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  return (
    <div className="flex min-h-0 min-h-screen flex-1 flex-col">
      <Header
        title={t("title")}
        backHref={`${localeRoot}/boards`}
        backLabel={t("back")}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 md:gap-3 md:p-4">
        <div className="flex min-h-0 flex-1 flex-col gap-2 md:flex-row">
          <aside
            className={`${
              leftOpen ? "flex" : "hidden"
            } md:sticky md:top-0 md:max-h-[min(100vh,960px)] md:min-h-0 w-full min-w-0 border border-[var(--flux-primary-alpha-10)] bg-[var(--flux-surface-card)] shadow-[0_0_0_1px_var(--flux-chrome-alpha-08),var(--flux-shadow-elevated-sm)] md:w-[300px] shrink-0 flex-col rounded-[var(--flux-rad)] p-2 backdrop-blur-[12px] max-md:max-h-[40vh] overflow-y-auto`.trim()}
          >
            <div className="mb-2 flex items-center justify-between gap-2 pr-0.5">
              <span className="text-xs font-display font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
                {t("treeTitle")}
              </span>
              <button
                type="button"
                onClick={() => setLeftOpen(false)}
                className="rounded p-1 text-xs text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-08)] md:hidden"
              >
                ✕
              </button>
            </div>
            <TocList
              roots={roots}
              byParent={byParent}
              locale={locale}
              currentSlug={slug}
              t={t}
            />
          </aside>
          {leftOpen ? null : (
            <button
              type="button"
              onClick={() => setLeftOpen(true)}
              className="mb-1 rounded border border-[var(--flux-primary-alpha-10)] bg-[var(--flux-surface-card)] px-2 py-1 text-left text-sm text-[var(--flux-text)] md:absolute md:top-4 md:left-2 md:mb-0"
            >
              {t("treeTitle")}
            </button>
          )}
          <div className="min-w-0 min-h-0 flex-1">
            <div className="mb-3 space-y-2">
              <div
                className="flex flex-wrap items-center gap-2 text-xs text-[var(--flux-text-muted)]"
                data-skip-command-palette
              >
                <span className="text-[var(--flux-text)]">{t("breadcrumbs.root")}</span>
                <span aria-hidden>/</span>
                <span className="text-[var(--flux-text)]">
                  {toc.items.find((x) => x.slug === slug)?.title[locale] ?? slug}
                </span>
              </div>
              <div
                className="flex flex-col gap-2 sm:flex-row sm:items-end"
                data-skip-command-palette
              >
                <div className="min-w-0 flex-1">
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={t("searchPlaceholder")}
                    className="w-full rounded-[var(--flux-rad-sm)] border border-[var(--flux-control-border)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-sm text-[var(--flux-text)] placeholder:text-[var(--flux-text-muted)]"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-[var(--flux-text)]">
                  <span className="text-[var(--flux-text-muted)] whitespace-nowrap">{t("filterTag")}</span>
                  <select
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                    className="max-w-full rounded border border-[var(--flux-control-border)] bg-[var(--flux-surface-elevated)] px-2 py-1 text-sm"
                  >
                    <option value="__all__">{t("filterTagAll")}</option>
                    {tags.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1.5 text-sm text-[var(--flux-text)]">
                  <input
                    type="checkbox"
                    checked={myPlanOnly}
                    onChange={(e) => setMyPlanOnly(e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  {t("filterMyPlan")}
                </label>
              </div>
              {q.trim() && searchHits.length > 0 && (
                <div className="max-h-36 overflow-y-auto rounded border border-[var(--flux-primary-alpha-10)] bg-[var(--flux-surface-elevated)] p-2 text-sm">
                  <ul className="space-y-1">
                    {searchHits.map((h) => (
                      <li key={h.id}>
                        <Link
                          href={`${localeRoot}/manual/${h.slug}`}
                          className="block w-full text-left text-[var(--flux-primary-light)] hover:underline"
                        >
                          {h.title}
                        </Link>
                        <p className="line-clamp-1 text-xs text-[var(--flux-text-muted)]">{h.excerpt}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {q.trim() && !searchHits.length && (
                <p className="text-sm text-[var(--flux-text-muted)]">{t("noSearchResults")}</p>
              )}
            </div>
            <article className="rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-10)] bg-[var(--flux-surface-card)] p-4 text-[var(--flux-text)] shadow-sm">
              <h1 className="mb-1 font-display text-2xl font-bold tracking-tight text-[var(--flux-text)]">
                {article?.title ||
                  (plansSnapshot ? t("plans.metaTitle") : slug)}
              </h1>
              {plansSnapshot ? <ManualPlansPanel snap={plansSnapshot} /> : null}
              {article ? (
                <div className="prose-onda4 mt-4 max-w-[72ch]">
                  <div className="docs-markdown-preview flux-docs-prose text-[var(--flux-text)]">
                    <DocsMarkdownPreview markdown={article.bodyMd} emptyLabel=" " />
                  </div>
                </div>
              ) : null}
            </article>
          </div>
          <aside
            className={`${
              rightOpen ? "flex" : "hidden"
            } w-full min-w-0 max-w-full flex-col gap-2 border border-[var(--flux-primary-alpha-10)] bg-[var(--flux-surface-card)] p-3 shadow-[0_0_0_1px_var(--flux-chrome-alpha-08),var(--flux-shadow-elevated-sm)] md:w-[360px] shrink-0 rounded-[var(--flux-rad)] backdrop-blur-[12px] min-h-0 sm:max-h-[min(100vh,960px)]`.trim()}
            data-skip-command-palette
          >
            <div className="mb-1 flex items-center justify-between">
              <div>
                <div className="text-sm font-display font-bold text-[var(--flux-text)]">{t("fluxyTitle")}</div>
                <div className="text-[11px] text-[var(--flux-text-muted)] font-fluxy">{t("fluxySubtitle")}</div>
              </div>
              <div className="h-9 w-9">
                <FluxyAvatar
                  className="h-9 w-9"
                  state={fluxy === "thinking" ? "thinking" : "idle"}
                  size="compact"
                />
              </div>
              <button
                type="button"
                onClick={() => setRightOpen(false)}
                className="ml-auto rounded p-1 text-xs text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-08)] md:hidden"
                aria-label="Minimize"
              >
                ✕
              </button>
            </div>
            <div
              className="min-h-0 min-h-[180px] flex-1 max-h-52 overflow-y-auto text-sm"
              data-skip-command-palette
            >
              {lines.map((L) => (
                <div
                  key={L.id}
                  className={L.role === "user" ? "mb-3 text-right" : "mb-3 text-left"}
                >
                  {L.role === "user" ? (
                    <div className="inline-block max-w-[100%] rounded-2xl rounded-tr-sm border border-[var(--flux-chrome-alpha-20)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-left text-sm text-[var(--flux-text)]">
                      {L.text}
                    </div>
                  ) : (
                    <FluxySpeechBubble className="text-left text-sm leading-relaxed">
                      {L.text}
                    </FluxySpeechBubble>
                  )}
                </div>
              ))}
              <div ref={endRef} />
            </div>
            {fluxy === "thinking" ? (
              <p className="text-xs text-[var(--flux-text-muted)] font-fluxy animate-pulse">{t("fluxyThinking")}</p>
            ) : null}
            <form onSubmit={onAsk} className="mt-auto flex flex-col gap-1">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t("fluxyPlaceholder")}
                className="w-full rounded border border-[var(--flux-control-border)] bg-[var(--flux-surface-elevated)] px-2 py-1.5 text-sm text-[var(--flux-text)]"
              />
              <button
                type="submit"
                className="self-end btn-primary px-3 py-1.5 text-xs"
                disabled={fluxy === "thinking" || !draft.trim()}
              >
                {t("fluxySend")}
              </button>
            </form>
            {rightOpen ? null : null}
          </aside>
        </div>
        <div className="flex items-center justify-center gap-2 md:hidden">
          <button
            type="button"
            className="btn-secondary px-2 py-1 text-xs"
            onClick={() => setLeftOpen((v) => !v)}
          >
            {t("treeTitle")}
          </button>
          <button
            type="button"
            className="btn-secondary px-2 py-1 text-xs"
            onClick={() => setRightOpen((v) => !v)}
          >
            {t("fluxyTitle")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ManualPlansPanel({ snap }: { snap: PlansSnap }) {
  const t = useTranslations("manualApp");
  return (
    <div className="mt-2 space-y-4 text-sm">
      <p className="text-[var(--flux-text-muted)]">{t("plans.intro")}</p>
      <div>
        <h2 className="mb-2 text-base font-semibold text-[var(--flux-text)]">{t("plans.limitsTitle")}</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <K label={t("plans.kFreeBoards")} value={String(snap.freeMaxBoards)} />
          <K label={t("plans.kFreeUsers")} value={String(snap.freeMaxUsers)} />
          <K label={t("plans.kProUsers")} value={String(snap.proMaxUsers)} />
          <K label={t("plans.kBizUsers")} value={String(snap.businessMaxUsers)} />
          <K label={t("plans.kTrialDays")} value={String(snap.trialDays)} />
          <K label={t("plans.kDowngradeGrace")} value={String(snap.downgradeGraceDays)} />
          <K
            className="sm:col-span-2"
            label={t("plans.kPaidBoards")}
            value={String(snap.paidMaxBoards)}
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <h2 className="mb-2 text-base font-semibold text-[var(--flux-text)]">{t("plans.matrixTitle")}</h2>
        <table className="w-full min-w-[520px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--flux-chrome-alpha-12)]">
              <th className="p-2 font-semibold text-[var(--flux-text)]">{t("plans.colFeature")}</th>
              <th className="p-2 font-semibold text-[var(--flux-text)]">{t("plans.colTiers")}</th>
            </tr>
          </thead>
          <tbody>
            {snap.featureRows.map((row) => (
              <tr key={row.key} className="border-b border-[var(--flux-chrome-alpha-08)] last:border-0">
                <td className="p-2 text-[var(--flux-text)] align-top">
                  <span className="font-mono text-[0.7rem] text-[var(--flux-text-muted)]">{row.key}</span>
                  <br />
                  {row.label}
                </td>
                <td className="p-2 text-[var(--flux-text)] align-top">{row.allowedTiers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function K({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div
      className={
        (className ? `${className} ` : "") +
        "rounded border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] p-2"
      }
    >
      <div className="text-[0.7rem] uppercase text-[var(--flux-text-muted)]">{label}</div>
      <div className="font-mono text-[var(--flux-text)]">{value}</div>
    </div>
  );
}

function TocList({
  roots,
  byParent,
  locale,
  currentSlug,
  t,
}: {
  roots: ManualTocItem[];
  byParent: Map<string | null, ManualTocItem[]>;
  locale: ManualLocale;
  currentSlug: string;
  t: ReturnType<typeof useTranslations<"manualApp">>;
}) {
  const showTierBadge = (it: ManualTocItem) => {
    if (it.minTier === "pro") {
      return (
        <span className="ml-1 rounded border border-[var(--flux-primary-alpha-25)] px-1.5 text-[0.6rem] text-[var(--flux-text-muted)]">
          {t("proBadge")}
        </span>
      );
    }
    if (it.minTier === "business") {
      return (
        <span className="ml-1 rounded border border-[var(--flux-secondary-alpha-20)] px-1.5 text-[0.6rem] text-[var(--flux-text-muted)]">
          {t("businessBadge")}
        </span>
      );
    }
    return null;
  };

  const walk = (items: ManualTocItem[], depth: number) => {
    return items.map((it) => {
      const isSel = it.slug === currentSlug;
      return (
        <li key={it.id} className="list-none">
          <div style={{ marginLeft: depth * 6 }}>
            <Link
              href={`/${locale}/manual/${it.slug}`}
              className={
                (isSel
                  ? "border-l-[var(--flux-primary-light)] bg-[var(--flux-primary-alpha-08)]"
                  : "border-l-transparent hover:bg-[var(--flux-chrome-alpha-06)]") +
                " my-0.5 block w-full max-w-full rounded-r-lg border-y-0 border-l-2 border-r-0 py-1.5 pl-2.5 pr-1 text-left text-sm text-[var(--flux-text)] transition-colors"
              }
            >
              {it.title[locale]}
              {showTierBadge(it)}
            </Link>
          </div>
          {(() => {
            const kids = byParent.get(it.id) ?? [];
            if (!kids.length) return null;
            return <ul className="mt-0.5 pl-0">{walk(kids, depth + 1)}</ul>;
          })()}
        </li>
      );
    });
  };
  return <ul className="m-0 space-y-0.5 p-0">{walk(roots, 0)}</ul>;
}
