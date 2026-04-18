"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { apiGet, ApiError } from "@/lib/api-client";
import { FluxSurface } from "@/components/ui/flux-surface";
import { useOnda4Flags } from "@/components/fluxy/use-onda4-flags";

type Props = {
  boardId: string;
};

export function BoardDailyBriefing({ boardId }: Props) {
  const { getHeaders } = useAuth();
  const onda4 = useOnda4Flags();
  const [md, setMd] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!onda4.enabled || !onda4.dailyBriefing || !boardId) return;
    let cancelled = false;
    const storageKey = `flux.dailyBriefing.${boardId}`;
    try {
      const cached = localStorage.getItem(storageKey);
      if (cached) {
        const parsed = JSON.parse(cached) as { at: string; markdown: string };
        const age = Date.now() - new Date(parsed.at).getTime();
        if (age < 12 * 60 * 60_000 && parsed.markdown) {
          setMd(parsed.markdown);
          return;
        }
      }
    } catch {
      /* ignore */
    }

    (async () => {
      setLoading(true);
      try {
        const data = await apiGet<{ markdown?: string }>(
          `/api/boards/${encodeURIComponent(boardId)}/executive-brief-ai?brief_type=daily_arrival`,
          getHeaders()
        );
        if (cancelled) return;
        const markdown = String(data?.markdown || "").trim();
        setMd(markdown || null);
        try {
          localStorage.setItem(storageKey, JSON.stringify({ at: new Date().toISOString(), markdown }));
        } catch {
          /* ignore */
        }
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && (e.status === 401 || e.status === 403 || e.status === 404)) {
          setMd(null);
          return;
        }
        setMd(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [boardId, getHeaders, onda4.enabled, onda4.dailyBriefing]);

  if (!onda4.enabled || !onda4.dailyBriefing) return null;
  if (!md && !loading) return null;

  return (
    <div className="border-b border-[var(--flux-border-muted)] px-4 py-2 sm:px-5">
      <FluxSurface tier={2} className="p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-secondary-light)]">Briefing do dia</p>
        {loading ? (
          <p className="mt-1 text-xs text-[var(--flux-text-muted)]">Gerando resumo…</p>
        ) : (
          <div className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-[var(--flux-text)]">
            {md}
          </div>
        )}
        {onda4.omnibar ? (
          <button
            type="button"
            className="mt-2 text-[10px] font-semibold text-[var(--flux-primary-light)] hover:underline"
            onClick={() => {
              const seed = "Aprofundar o briefing de hoje com o copiloto";
              window.dispatchEvent(new CustomEvent("flux-open-fluxy-omnibar", { detail: { seed } }));
            }}
          >
            Abrir na Omnibar Fluxy
          </button>
        ) : null}
      </FluxSurface>
    </div>
  );
}
