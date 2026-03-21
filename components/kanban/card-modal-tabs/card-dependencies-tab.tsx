"use client";

import { useCallback, useEffect, useState } from "react";
import { useCardModal } from "@/components/kanban/card-modal-context";
import { CardModalSection, inputBase } from "@/components/kanban/card-modal-section";
import type { CardModalTabBaseProps } from "@/components/kanban/card-modal-tabs/types";
import { apiDelete, apiGet, apiPost, ApiError } from "@/lib/api-client";

type LinkRow = {
  _id: string;
  sourceBoardId: string;
  sourceCardId: string;
  targetBoardId: string;
  targetCardId: string;
  kind: "depends_on" | "blocks" | "related_to";
  confidence: number;
};

type SuggestionRow = {
  boardIdA: string;
  cardIdA: string;
  boardIdB: string;
  cardIdB: string;
  score: number;
};

type SearchHit = { boardId: string; boardName: string; cardId: string; title: string };

export default function CardDependenciesTab({ cardId }: CardModalTabBaseProps) {
  const { mode, boardId, getHeaders, t } = useCardModal();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);

  const [kind, setKind] = useState<"depends_on" | "blocks" | "related_to">("depends_on");
  const [searchQ, setSearchQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [picked, setPicked] = useState<SearchHit | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (mode !== "edit") return;
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        boardId,
        cardId,
        suggestionsBoardId: boardId,
        minSuggestionScore: "0.85",
      });
      const res = await apiGet<{ links: LinkRow[]; suggestions: SuggestionRow[] }>(
        `/api/org/card-dependencies?${q.toString()}`,
        getHeaders()
      );
      const nextLinks = res.links || [];
      setLinks(nextLinks);

      const sug = (res.suggestions || []).filter((s) => {
        const touches =
          (s.boardIdA === boardId && s.cardIdA === cardId) || (s.boardIdB === boardId && s.cardIdB === cardId);
        if (!touches) return false;
        const other =
          s.boardIdA === boardId && s.cardIdA === cardId
            ? { bid: s.boardIdB, cid: s.cardIdB }
            : { bid: s.boardIdA, cid: s.cardIdA };
        const exists = nextLinks.some(
          (l) =>
            (l.sourceBoardId === boardId &&
              l.sourceCardId === cardId &&
              l.targetBoardId === other.bid &&
              l.targetCardId === other.cid) ||
            (l.targetBoardId === boardId &&
              l.targetCardId === cardId &&
              l.sourceBoardId === other.bid &&
              l.sourceCardId === other.cid)
        );
        return !exists;
      });
      setSuggestions(sug);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError(t("cardModal.depsTab.loadError"));
      }
      setLinks([]);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [boardId, cardId, getHeaders, mode, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    const q = searchQ.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const tmr = window.setTimeout(async () => {
      try {
        const res = await apiGet<{ results: SearchHit[] }>(
          `/api/org/cards-search?q=${encodeURIComponent(q)}&excludeBoardId=${encodeURIComponent(boardId)}`,
          getHeaders()
        );
        if (!cancelled) setHits(res.results || []);
      } catch {
        if (!cancelled) setHits([]);
      }
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(tmr);
    };
  }, [searchQ, boardId, getHeaders]);

  const refresh = () => void load();

  const onAdd = async () => {
    if (!picked) return;
    setSaving(true);
    setError(null);
    try {
      await apiPost(
        "/api/org/card-dependencies",
        {
          sourceBoardId: boardId,
          sourceCardId: cardId,
          targetBoardId: picked.boardId,
          targetCardId: picked.cardId,
          kind,
          confidence: 1,
        },
        getHeaders()
      );
      setPicked(null);
      setSearchQ("");
      setHits([]);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("cardModal.depsTab.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (linkId: string) => {
    try {
      await apiDelete(`/api/org/card-dependencies?linkId=${encodeURIComponent(linkId)}`, getHeaders());
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("cardModal.depsTab.deleteError"));
    }
  };

  const onAcceptSuggestion = async (s: SuggestionRow) => {
    const isA = s.boardIdA === boardId && s.cardIdA === cardId;
    const other = isA
      ? { ob: s.boardIdB, oc: s.cardIdB }
      : { ob: s.boardIdA, oc: s.cardIdA };
    setSaving(true);
    setError(null);
    try {
      await apiPost(
        "/api/org/card-dependencies",
        {
          sourceBoardId: boardId,
          sourceCardId: cardId,
          targetBoardId: other.ob,
          targetCardId: other.oc,
          kind: "related_to",
          confidence: s.score,
        },
        getHeaders()
      );
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("cardModal.depsTab.saveError"));
    } finally {
      setSaving(false);
    }
  };

  if (mode !== "edit") {
    return (
      <CardModalSection title={t("cardModal.depsTab.title")} description={t("cardModal.depsTab.needSave")}>
        {null}
      </CardModalSection>
    );
  }

  if (loading) {
    return (
      <CardModalSection title={t("cardModal.depsTab.title")}>
        <p className="text-sm text-[var(--flux-text-muted)]">{t("cardModal.tabLoading")}</p>
      </CardModalSection>
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p className="text-sm text-[var(--flux-danger)]" role="alert">
          {error}
        </p>
      ) : null}

      <CardModalSection title={t("cardModal.depsTab.title")} description={t("cardModal.depsTab.description")}>
        <p className="text-[11px] text-[var(--flux-text-muted)] mb-3">{t("cardModal.depsTab.hintKinds")}</p>
        <ul className="space-y-2 max-h-[220px] overflow-y-auto scrollbar-kanban">
          {links.length === 0 ? (
            <li className="text-sm text-[var(--flux-text-muted)]">{t("cardModal.depsTab.emptyLinks")}</li>
          ) : (
            links.map((l) => {
              const out =
                l.sourceBoardId === boardId && l.sourceCardId === cardId
                  ? `${t(`cardModal.depsTab.kind.${l.kind}`)} → ${l.targetBoardId}/${l.targetCardId}`
                  : `${l.sourceBoardId}/${l.sourceCardId} → ${t(`cardModal.depsTab.kind.${l.kind}`)} → este card`;
              return (
                <li
                  key={l._id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--flux-chrome-alpha-08)] px-3 py-2 text-sm"
                >
                  <span className="min-w-0 break-all">{out}</span>
                  <span className="text-[10px] text-[var(--flux-text-muted)]">
                    {(l.confidence * 100).toFixed(0)}%
                  </span>
                  <button type="button" className="btn-danger text-xs py-1 px-2" onClick={() => onDelete(l._id)}>
                    {t("cardModal.depsTab.remove")}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </CardModalSection>

      <CardModalSection title={t("cardModal.depsTab.addTitle")}>
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-[var(--flux-text-muted)] uppercase tracking-wider font-display">
            {t("cardModal.depsTab.kindLabel")}
          </label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className={inputBase}
          >
            <option value="depends_on">{t("cardModal.depsTab.kind.depends_on")}</option>
            <option value="blocks">{t("cardModal.depsTab.kind.blocks")}</option>
            <option value="related_to">{t("cardModal.depsTab.kind.related_to")}</option>
          </select>
          <input
            type="search"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder={t("cardModal.depsTab.searchPlaceholder")}
            className={inputBase}
            autoComplete="off"
          />
          {hits.length > 0 && (
            <ul className="max-h-36 overflow-y-auto rounded-lg border border-[var(--flux-chrome-alpha-10)] divide-y divide-[var(--flux-chrome-alpha-06)]">
              {hits.map((h) => (
                <li key={`${h.boardId}:${h.cardId}`}>
                  <button
                    type="button"
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--flux-primary-alpha-08)] ${
                      picked?.cardId === h.cardId && picked?.boardId === h.boardId ? "bg-[var(--flux-primary-alpha-12)]" : ""
                    }`}
                    onClick={() => setPicked(h)}
                  >
                    <span className="block font-semibold text-[var(--flux-text)] truncate">{h.title}</span>
                    <span className="block text-[11px] text-[var(--flux-text-muted)]">
                      {h.boardName} · {h.cardId}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="btn-primary text-sm"
            disabled={!picked || saving}
            onClick={() => void onAdd()}
          >
            {t("cardModal.depsTab.addButton")}
          </button>
        </div>
      </CardModalSection>

      <CardModalSection title={t("cardModal.depsTab.suggestionsTitle")} description={t("cardModal.depsTab.suggestionsHint")}>
        {suggestions.length === 0 ? (
          <p className="text-sm text-[var(--flux-text-muted)]">{t("cardModal.depsTab.noSuggestions")}</p>
        ) : (
          <ul className="space-y-2">
            {suggestions.slice(0, 12).map((s, idx) => {
              const isA = s.boardIdA === boardId && s.cardIdA === cardId;
              const otherBoard = isA ? s.boardIdB : s.boardIdA;
              const otherCard = isA ? s.cardIdB : s.cardIdA;
              return (
                <li
                  key={`${s.boardIdA}-${s.cardIdA}-${s.boardIdB}-${s.cardIdB}-${idx}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--flux-chrome-alpha-08)] px-3 py-2 text-sm"
                >
                  <span>
                    {otherBoard}/{otherCard} · score {(s.score * 100).toFixed(1)}%
                  </span>
                  <button
                    type="button"
                    className="btn-secondary text-xs py-1 px-2"
                    disabled={saving}
                    onClick={() => void onAcceptSuggestion(s)}
                  >
                    {t("cardModal.depsTab.acceptSuggestion")}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <button type="button" className="mt-3 text-xs font-semibold text-[var(--flux-primary-light)]" onClick={refresh}>
          {t("cardModal.depsTab.refresh")}
        </button>
      </CardModalSection>
    </div>
  );
}
