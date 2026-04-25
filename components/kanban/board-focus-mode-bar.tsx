"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

const POMODORO_SECONDS = 25 * 60;

export type BoardFocusModeBarSprint = {
  sprintId: string;
  sprintName: string;
};

interface BoardFocusModeBarProps {
  onExit: () => void;
  locale: string;
  boardId: string;
  focusSprint?: BoardFocusModeBarSprint | null;
}

export function BoardFocusModeBar({ onExit, locale, boardId, focusSprint }: BoardFocusModeBarProps) {
  const t = useTranslations("kanban.board.focusMode");
  const tSprint = useTranslations("kanban.board.sprintContext");

  const [showTimer, setShowTimer] = useState(false);
  const [seconds, setSeconds] = useState(POMODORO_SECONDS);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTick = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!running || seconds <= 0) {
      clearTick();
      if (seconds <= 0) setRunning(false);
      return;
    }
    intervalRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearTick();
          setRunning(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return clearTick;
  }, [running, seconds, clearTick]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  const handleStart = useCallback(() => {
    if (seconds <= 0) setSeconds(POMODORO_SECONDS);
    setRunning(true);
  }, [seconds]);

  const handlePause = useCallback(() => setRunning(false), []);

  const handleReset = useCallback(() => {
    setRunning(false);
    setSeconds(POMODORO_SECONDS);
  }, []);

  const localeRoot = `/${locale}`;
  const sprintCcHref =
    focusSprint &&
    `${localeRoot}/sprints/${encodeURIComponent(boardId)}/${encodeURIComponent(focusSprint.sprintId)}/command-center`;

  return (
    <div
      className="fixed top-3 right-3 z-[9999] flex max-w-[min(100vw-1.5rem,420px)] flex-col items-stretch gap-2 rounded-xl border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)]/90 px-3 py-2 shadow-lg backdrop-blur-md sm:max-w-none sm:flex-row sm:items-center sm:gap-3 sm:px-4"
      role="toolbar"
      aria-label={t("enter")}
    >
      {focusSprint && sprintCcHref ? (
        <div className="flex min-w-0 items-center gap-2 border-b border-[var(--flux-chrome-alpha-08)] pb-2 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-3">
          <div className="h-5 w-[3px] shrink-0 rounded-full bg-[var(--flux-primary)]" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[10px] font-semibold text-[var(--flux-text)]" title={focusSprint.sprintName}>
              {focusSprint.sprintName}
            </div>
            <Link
              href={sprintCcHref}
              className="text-[10px] font-semibold text-[var(--flux-primary-light)] underline-offset-2 hover:underline"
            >
              {tSprint("commandCenter")}
            </Link>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <span className="text-xs font-bold uppercase tracking-wider text-[var(--flux-primary-light)]">{t("enter")}</span>

        <button
          type="button"
          onClick={() => setShowTimer((v) => !v)}
          className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors ${
            showTimer
              ? "border-[var(--flux-primary-alpha-45)] bg-[var(--flux-primary-alpha-12)] text-[var(--flux-primary-light)]"
              : "border-[var(--flux-chrome-alpha-12)] text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)]"
          }`}
        >
          {t("timer")}
        </button>

        {showTimer && (
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-sm font-bold tabular-nums text-[var(--flux-text)]">
              {mm}:{ss}
            </span>
            {!running ? (
              <button
                type="button"
                onClick={handleStart}
                className="rounded-md border border-[var(--flux-success)]/40 bg-[var(--flux-success)]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--flux-success)] hover:bg-[var(--flux-success)]/20"
              >
                {t("start")}
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePause}
                className="rounded-md border border-[var(--flux-warning)]/40 bg-[var(--flux-warning)]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--flux-warning)] hover:bg-[var(--flux-warning)]/20"
              >
                {t("pause")}
              </button>
            )}
            <button
              type="button"
              onClick={handleReset}
              className="rounded-md border border-[var(--flux-chrome-alpha-12)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--flux-text-muted)] hover:border-[var(--flux-primary-alpha-35)]"
            >
              {t("reset")}
            </button>
          </div>
        )}

        <div className="hidden h-5 w-px bg-[var(--flux-border-default)] sm:block" />

        <button
          type="button"
          onClick={onExit}
          className="rounded-md border border-[var(--flux-danger)]/40 bg-[var(--flux-danger)]/10 px-2.5 py-1 text-[11px] font-semibold text-[var(--flux-danger)] transition-colors hover:bg-[var(--flux-danger)]/20"
        >
          {t("exit")}
        </button>
      </div>
    </div>
  );
}
