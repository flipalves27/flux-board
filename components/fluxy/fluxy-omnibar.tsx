"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { apiPost, ApiError } from "@/lib/api-client";
import type { FluxyClassifyMeta, FluxyClassifyResponse, FluxyIntentKind, FluxyOmnibarResultItem } from "@/lib/fluxy-intent-types";
import { executeFluxyOmnibarResult } from "@/lib/fluxy-intent-executor";
import { useOnda4Flags } from "./use-onda4-flags";
import { useFluxyOmnibarStore } from "@/stores/fluxy-omnibar-store";
import { FluxyOmnibarChip } from "./omnibar/fluxy-omnibar-chip";
import { FluxyOmnibarInput } from "./omnibar/fluxy-omnibar-input";
import { FluxyOmnibarResults } from "./omnibar/fluxy-omnibar-results";
import { FluxyOmnibarFooter } from "./omnibar/fluxy-omnibar-footer";

const DEBOUNCE_MS = 180;

function boardIdFromPath(pathname: string): string | undefined {
  const m = pathname.match(/\/board\/([^/?#]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : undefined;
}

export function FluxyOmnibar() {
  const flags = useOnda4Flags();
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const localeRoot = `/${locale}`;
  const { getHeaders } = useAuth();

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [intent, setIntent] = useState<FluxyIntentKind>("unknown");
  const [speech, setSpeech] = useState("");
  const [results, setResults] = useState<FluxyOmnibarResultItem[]>([]);
  const [meta, setMeta] = useState<FluxyClassifyMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushHistory = useFluxyOmnibarStore((s) => s.pushHistory);
  const pendingSeed = useFluxyOmnibarStore((s) => s.pendingSeed);
  const setPendingSeed = useFluxyOmnibarStore((s) => s.setPendingSeed);

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setResults([]);
    setMeta(null);
    setErr(null);
    setSpeech("");
    setIntent("unknown");
    setActiveIndex(0);
    abortRef.current?.abort();
    abortRef.current = null;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = null;
  }, []);

  const runClassify = useCallback(
    async (text: string, signal: AbortSignal) => {
      if (!text.trim()) {
        setResults([]);
        setMeta(null);
        setIntent("unknown");
        setSpeech("");
        return;
      }
      setBusy(true);
      setErr(null);
      try {
        const boardId = boardIdFromPath(pathname);
        const body = {
          text: text.trim(),
          locale: locale === "en" ? "en" : "pt-BR",
          context: { pathname, boardId, localOnly: false },
        };
        const data = await apiPost<FluxyClassifyResponse>("/api/fluxy/classify", body, getHeaders());
        if (signal.aborted) return;
        setIntent(data.intent);
        setSpeech(data.speech);
        setResults(Array.isArray(data.results) ? data.results : []);
        setMeta(data.meta ?? null);
        setActiveIndex(0);
      } catch (e) {
        if (signal.aborted) return;
        const msg = e instanceof ApiError ? e.message : "Não foi possível classificar agora.";
        setErr(msg);
        setResults([]);
        setMeta(null);
      } finally {
        if (!signal.aborted) setBusy(false);
      }
    },
    [getHeaders, locale, pathname]
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReducedMotion(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    const onFluxOpen = (ev: Event) => {
      const d = (ev as CustomEvent<{ seed?: string }>).detail;
      setOpen(true);
      if (d?.seed) {
        setQ(d.seed);
        setPendingSeed(null);
      }
    };
    window.addEventListener("flux-open-fluxy-omnibar", onFluxOpen as EventListener);
    return () => window.removeEventListener("flux-open-fluxy-omnibar", onFluxOpen as EventListener);
  }, [setPendingSeed]);

  useEffect(() => {
    if (!open || !pendingSeed) return;
    setQ(pendingSeed);
    setPendingSeed(null);
  }, [open, pendingSeed, setPendingSeed]);

  useEffect(() => {
    if (!open) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runClassify(q, ac.signal);
    }, DEBOUNCE_MS);
    return () => {
      ac.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, q, runClassify]);

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, results, activeIndex]);

  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(0, results.length - 1)));
  }, [results.length]);

  useEffect(() => {
    if (!flags.enabled || !flags.omnibar) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flags.enabled, flags.omnibar]);

  const activateItem = useCallback(
    (item: FluxyOmnibarResultItem) => {
      pushHistory({ at: new Date().toISOString(), text: q, intent });
      executeFluxyOmnibarResult(item, localeRoot, router.push);
      close();
    },
    [close, intent, localeRoot, pushHistory, q, router]
  );

  if (!flags.enabled || !flags.omnibar) return null;

  if (!open) {
    return (
      <button
        type="button"
        className="fixed bottom-[max(5.5rem,env(safe-area-inset-bottom,0px))] left-1/2 z-[var(--flux-z-command-content)] hidden -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--flux-border-subtle)] bg-[var(--flux-surface-card)] px-4 py-2 text-xs font-medium text-[var(--flux-text-muted)] shadow-[var(--flux-shadow-md)] md:flex"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        Fluxy <kbd className="rounded bg-[var(--flux-surface-elevated)] px-1">⌘K</kbd>
      </button>
    );
  }

  return (
    <div
      data-skip-command-palette
      className="fixed inset-0 z-[var(--flux-z-command-backdrop)] flex items-start justify-center bg-[color-mix(in_srgb,var(--flux-surface-dark)_55%,transparent)] p-4 pt-[max(12vh,env(safe-area-inset-top,0px))] backdrop-blur-[8px] md:pt-[15vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Fluxy omnibar"
    >
      <div
        className={`relative z-[var(--flux-z-command-content)] flux-surface-3 w-full max-w-[560px] p-4 shadow-[var(--flux-shadow-xl)] ${
          reducedMotion ? "" : "motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-secondary-light)]">Fluxy</p>
            <FluxyOmnibarChip intent={intent} />
          </div>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-[var(--flux-text-muted)] hover:bg-[var(--flux-surface-hover)] md:hidden"
            aria-label="Fechar"
            onClick={close}
          >
            ✕
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const item = results[activeIndex];
            if (item) activateItem(item);
          }}
        >
          <FluxyOmnibarInput inputRef={inputRef} value={q} onChange={setQ} onClose={close} busy={busy} reducedMotion={reducedMotion} />
          {speech ? <p className="mt-2 text-xs text-[var(--flux-text-muted)]">{speech}</p> : null}
          {err ? <p className="mt-2 text-xs text-[var(--flux-danger,#ef4444)]">{err}</p> : null}
          <FluxyOmnibarResults
            items={results}
            activeIndex={activeIndex}
            onSelectIndex={setActiveIndex}
            onActivate={(item) => activateItem(item)}
          />
          <FluxyOmnibarFooter meta={meta} keyboardHints />
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={close}>
              Fechar
            </button>
            <button type="submit" className="btn-primary px-3 py-1.5 text-xs" disabled={!results[activeIndex]}>
              Ir
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
