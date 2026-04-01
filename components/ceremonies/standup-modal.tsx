"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useModalA11y } from "@/components/ui/use-modal-a11y";
import { apiFetch, getApiHeaders } from "@/lib/api-client";
import { useCeremonyStore } from "@/stores/ceremony-store";

type Entry = {
  id: string;
  userName: string;
  didYesterday: string;
  willToday: string;
  blockers: string;
};

export default function StandupModal({ getHeaders }: { getHeaders: () => Record<string, string> }) {
  const t = useTranslations("ceremonies");
  const open = useCeremonyStore((s) => s.standupModalOpen);
  const boardId = useCeremonyStore((s) => s.standupBoardId);
  const close = useCeremonyStore((s) => s.closeStandup);

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  useModalA11y({ open, onClose: close, containerRef: dialogRef, initialFocusRef: closeBtnRef });

  const getHeadersRef = useRef(getHeaders);
  getHeadersRef.current = getHeaders;

  const today = new Date().toISOString().slice(0, 10);
  const [date] = useState(today);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [didYesterday, setDidYesterday] = useState("");
  const [willToday, setWillToday] = useState("");
  const [blockers, setBlockers] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!open || !boardId) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await apiFetch(
        `/api/boards/${encodeURIComponent(boardId)}/standup?date=${encodeURIComponent(date)}`,
        { headers: getApiHeaders(getHeadersRef.current()) }
      );
      if (!res.ok) {
        setErr(t("error"));
        setEntries([]);
        return;
      }
      const data = (await res.json()) as { entries?: Entry[] };
      setEntries(Array.isArray(data.entries) ? data.entries : []);
    } catch {
      setErr(t("error"));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [open, boardId, date, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!boardId) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}/standup`, {
        method: "POST",
        headers: getApiHeaders(getHeadersRef.current()),
        body: JSON.stringify({ didYesterday, willToday, blockers, date }),
      });
      if (!res.ok) {
        setErr(t("error"));
        return;
      }
      setDidYesterday("");
      setWillToday("");
      setBlockers("");
      await load();
    } catch {
      setErr(t("error"));
    } finally {
      setSaving(false);
    }
  };

  if (!open || !boardId) return null;

  return (
    <div className="fixed inset-0 z-[var(--flux-z-modal-feature)] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-xl" aria-hidden onClick={close} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl flux-glass-elevated flux-depth-3 shadow-[var(--flux-shadow-modal-depth)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--flux-chrome-alpha-08)] px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[var(--flux-text)]">{t("standupTitle")}</h2>
            <p className="mt-0.5 text-xs text-[var(--flux-text-muted)]">{t("standupSubtitle")}</p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={close}
            className="rounded-lg border border-[var(--flux-chrome-alpha-12)] px-2 py-1 text-xs text-[var(--flux-text-muted)] hover:bg-[var(--flux-chrome-alpha-06)]"
          >
            {t("close")}
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
          {err ? <p className="text-xs text-[var(--flux-danger)]">{err}</p> : null}
          <div className="space-y-2">
            <label className="block text-[11px] font-semibold uppercase text-[var(--flux-text-muted)]">{t("didYesterday")}</label>
            <textarea
              value={didYesterday}
              onChange={(e) => setDidYesterday(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-[var(--flux-chrome-alpha-10)] bg-transparent px-3 py-2 text-sm text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
            />
            <label className="block text-[11px] font-semibold uppercase text-[var(--flux-text-muted)]">{t("willToday")}</label>
            <textarea
              value={willToday}
              onChange={(e) => setWillToday(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-[var(--flux-chrome-alpha-10)] bg-transparent px-3 py-2 text-sm text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
            />
            <label className="block text-[11px] font-semibold uppercase text-[var(--flux-text-muted)]">{t("blockers")}</label>
            <textarea
              value={blockers}
              onChange={(e) => setBlockers(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-[var(--flux-chrome-alpha-10)] bg-transparent px-3 py-2 text-sm text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
            />
            <button
              type="button"
              disabled={saving || (!didYesterday.trim() && !willToday.trim())}
              onClick={() => void save()}
              className="w-full rounded-lg bg-[var(--flux-secondary)] py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {saving ? t("saving") : t("saveStandup")}
            </button>
          </div>
          <div>
            <h3 className="mb-2 text-[11px] font-semibold uppercase text-[var(--flux-text-muted)]">{t("teamToday")}</h3>
            {loading ? <p className="text-xs text-[var(--flux-text-muted)]">{t("loading")}</p> : null}
            {!loading && entries.length === 0 ? (
              <p className="text-xs text-[var(--flux-text-muted)]">{t("emptyStandup")}</p>
            ) : null}
            <ul className="space-y-2">
              {entries.map((e) => (
                <li key={e.id} className="rounded-lg border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-elevated)] px-3 py-2 text-xs">
                  <p className="font-semibold text-[var(--flux-text)]">{e.userName}</p>
                  {e.didYesterday ? <p className="mt-1 text-[var(--flux-text-muted)]">{e.didYesterday}</p> : null}
                  {e.willToday ? <p className="mt-1 text-[var(--flux-text)]">{e.willToday}</p> : null}
                  {e.blockers ? <p className="mt-1 text-[var(--flux-warning)]">{e.blockers}</p> : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
