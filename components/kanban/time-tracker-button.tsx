"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, getApiHeaders } from "@/lib/api-client";
import { CustomTooltip } from "@/components/ui/custom-tooltip";
import type { TimeEntryData } from "@/lib/schemas";

type TimeTrackerButtonProps = {
  boardId: string;
  cardId: string;
  getHeaders: () => Record<string, string>;
  compact?: boolean;
};

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function TimeTrackerButton({ boardId, cardId, getHeaders, compact = false }: TimeTrackerButtonProps) {
  const [running, setRunning] = useState(false);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const baseUrl = `/api/boards/${encodeURIComponent(boardId)}/cards/${encodeURIComponent(cardId)}/time`;

  const loadEntries = useCallback(async () => {
    try {
      const res = await apiFetch(baseUrl, { headers: getApiHeaders(getHeaders()) });
      if (res.ok) {
        const data = await res.json() as { entries: TimeEntryData[] };
        const total = data.entries.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
        setTotalMinutes(total);
      }
    } catch { /* ignore */ }
  }, [baseUrl, getHeaders]);

  useEffect(() => { void loadEntries(); }, [loadEntries]);

  // Auto-pause on visibility change
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && running && activeEntryId) {
        void handleStop();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  });

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        if (startTime) setElapsed(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setElapsed(0);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, startTime]);

  const handleStart = useCallback(async () => {
    try {
      const res = await apiFetch(baseUrl, {
        method: "POST",
        body: JSON.stringify({}),
        headers: getApiHeaders(getHeaders()),
      });
      if (res.ok) {
        const data = await res.json() as { entry: TimeEntryData };
        setActiveEntryId(data.entry.id);
        setStartTime(Date.now());
        setRunning(true);
      }
    } catch { /* ignore */ }
  }, [baseUrl, getHeaders]);

  const handleStop = useCallback(async () => {
    if (!activeEntryId) return;
    try {
      const res = await apiFetch(baseUrl, {
        method: "POST",
        body: JSON.stringify({ action: "stop", entryId: activeEntryId }),
        headers: getApiHeaders(getHeaders()),
      });
      if (res.ok) {
        const data = await res.json() as { entry: TimeEntryData };
        setRunning(false);
        setActiveEntryId(null);
        setTotalMinutes((prev) => prev + (data.entry.durationMinutes ?? 0));
      }
    } catch { /* ignore */ }
  }, [activeEntryId, baseUrl, getHeaders]);

  const tooltipContent = running
    ? `Timer rodando: ${formatDuration(elapsed)} — Clique para parar`
    : `Time tracking${totalMinutes > 0 ? ` (total: ${totalMinutes}min)` : ""} — Clique para iniciar`;

  return (
    <CustomTooltip content={tooltipContent} position="top">
      <button
        type="button"
        onClick={running ? () => void handleStop() : () => void handleStart()}
        className={`inline-flex items-center gap-1.5 rounded-lg border transition-all duration-200 ${
          running
            ? "border-[var(--flux-danger-alpha-35)] bg-[var(--flux-danger-alpha-08)] text-[var(--flux-danger)] hover:bg-[var(--flux-danger-alpha-15)]"
            : "border-[var(--flux-chrome-alpha-12)] text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)] hover:text-[var(--flux-primary-light)]"
        } ${compact ? "px-1.5 py-1" : "px-2.5 py-1.5"}`}
        aria-label={tooltipContent}
      >
        {running ? (
          <>
            <span className="w-2 h-2 rounded-sm bg-[var(--flux-danger)] animate-pulse" aria-hidden />
            {!compact && <span className="text-xs font-mono tabular-nums">{formatDuration(elapsed)}</span>}
          </>
        ) : (
          <>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 shrink-0" aria-hidden>
              <circle cx="12" cy="12" r="10" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
            </svg>
            {!compact && totalMinutes > 0 && (
              <span className="text-[11px] font-mono tabular-nums">{totalMinutes}m</span>
            )}
          </>
        )}
      </button>
    </CustomTooltip>
  );
}
