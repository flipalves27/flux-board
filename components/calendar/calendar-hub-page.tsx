"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { useLocale, useTranslations } from "next-intl";
import { apiGet, ApiError } from "@/lib/api-client";
import type { SprintData } from "@/lib/schemas";
import type { CardData } from "@/app/board/[id]/page";
import { useToast } from "@/context/toast-context";
import { FluxEmptyState } from "@/components/ui/flux-empty-state";
import { dayKeyFromTime } from "@/lib/delivery-calendar";
import { parseHubMode, type HubMode } from "./calendar-types";
import { CalendarHubLayout } from "./calendar-hub-layout";
import { CalendarMonthView } from "./calendar-month-view";
import { CalendarManagerView } from "./calendar-manager-view";
import { CalendarScheduleView } from "./calendar-schedule-view";

type BoardListRow = { id: string; name: string };

type Member = { userId: string; username: string; name?: string };

function useBoardBootstrap(boardId: string, getHeaders: () => Record<string, string>, enabled: boolean) {
  const { pushToast } = useToast();
  const t = useTranslations("deliveryCalendar");
  const [loading, setLoading] = useState(false);
  const [cards, setCards] = useState<CardData[]>([]);
  const [sprints, setSprints] = useState<SprintData[]>([]);

  useEffect(() => {
    if (!enabled || !boardId) {
      setCards([]);
      setSprints([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await apiGet<{ board: { cards?: CardData[] }; sprints: SprintData[] }>(
          `/api/boards/${encodeURIComponent(boardId)}/bootstrap`,
          getHeaders()
        );
        if (cancelled) return;
        setCards(Array.isArray(data.board?.cards) ? (data.board.cards as CardData[]) : []);
        setSprints(Array.isArray(data.sprints) ? data.sprints : []);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof ApiError ? e.message : t("loadError");
        pushToast({ kind: "error", title: msg });
        setCards([]);
        setSprints([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boardId, enabled, getHeaders, pushToast, t]);

  return { cards, sprints, loading };
}

function useMembers(boardId: string, getHeaders: () => Record<string, string>, enabled: boolean) {
  const { pushToast } = useToast();
  const t = useTranslations("deliveryCalendar");
  const [members, setMembers] = useState<Member[]>([]);
  useEffect(() => {
    if (!enabled || !boardId) {
      setMembers([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await apiGet<{ members: Member[] }>(
          `/api/boards/${encodeURIComponent(boardId)}/members`,
          getHeaders()
        );
        if (!cancelled) setMembers(Array.isArray(data.members) ? data.members : []);
      } catch {
        if (cancelled) return;
        pushToast({ kind: "error", title: t("membersError") });
        setMembers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boardId, enabled, getHeaders, pushToast, t]);
  return members;
}

function CalendarHubContent() {
  const t = useTranslations("deliveryCalendar");
  const router = useRouter();
  const locale = useLocale();
  const sp = useSearchParams();
  const { user, getHeaders, isChecked } = useAuth();
  const nowMs = Date.now();

  const [boards, setBoards] = useState<BoardListRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [y, setY] = useState(() => new Date().getUTCFullYear());
  const [m, setM] = useState(() => new Date().getUTCMonth() + 1);

  const paramBoard = sp.get("board")?.trim() ?? "";
  const paramMode = parseHubMode(sp.get("mode"));
  const paramSprint = sp.get("sprint")?.trim() ?? "";

  const boardId = paramBoard;
  const mode: HubMode = paramMode;
  const sprintId = paramSprint;

  const { cards, sprints, loading: bootLoading } = useBoardBootstrap(boardId, getHeaders, Boolean(user && isChecked));
  const members = useMembers(boardId, getHeaders, Boolean(user && isChecked && boardId));

  const assigneeNameById = useCallback(
    (id: string | null | undefined) => {
      if (!id) return "—";
      const row = members.find((u) => u.userId === id);
      if (!row) return id;
      return (row.name || row.username).trim() || row.username;
    },
    [members]
  );

  const sprintObj = useMemo(
    () => sprints.find((s) => s.id === sprintId) ?? null,
    [sprints, sprintId]
  );

  useEffect(() => {
    if (!isChecked || !user) return;
    let cancelled = false;
    (async () => {
      setListLoading(true);
      try {
        const data = await apiGet<{ boards: BoardListRow[] }>("/api/boards", getHeaders());
        if (cancelled) return;
        const list = Array.isArray(data.boards) ? data.boards : [];
        setBoards(list);
        if (!paramBoard && list[0]) {
          const p = new URLSearchParams();
          p.set("board", list[0]!.id);
          p.set("mode", paramMode);
          if (paramSprint) p.set("sprint", paramSprint);
          router.replace(`/${locale}/calendar?${p.toString()}`, { scroll: false });
        }
      } catch {
        if (cancelled) return;
        setBoards([]);
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isChecked, user, getHeaders, paramBoard, paramMode, paramSprint, router, locale]);

  const pushState = (next: { board?: string; mode?: HubMode; sprint?: string }) => {
    const p = new URLSearchParams();
    const b = (next.board ?? paramBoard).trim();
    if (b) p.set("board", b);
    p.set("mode", next.mode ?? mode);
    const s = (next.sprint !== undefined ? next.sprint : sprintId).trim();
    if (s) p.set("sprint", s);
    router.replace(`/${locale}/calendar?${p.toString()}`, { scroll: false });
  };

  if (!isChecked) {
    return <div className="p-6 text-sm text-[var(--flux-text-muted)]">{t("authLoading")}</div>;
  }
  if (!user) {
    return (
      <div className="p-6 max-w-md">
        <FluxEmptyState
          title={t("unauthenticatedTitle")}
          description={t("unauthenticatedMessage")}
        />
      </div>
    );
  }

  const todayKey = dayKeyFromTime(Date.now());
  const bodyLoading = listLoading || (Boolean(boardId) && bootLoading);

  return (
    <CalendarHubLayout
      mode={mode}
      onMode={(v) => pushState({ mode: v })}
      boards={boards}
      boardId={boardId}
      onBoardId={(id) => pushState({ board: id, mode, sprint: "" })}
      sprints={sprints}
      sprintId={sprintId}
      onSprintId={(id) => pushState({ mode, sprint: id ?? "" })}
    >
      {bodyLoading ? (
        <p className="text-sm text-[var(--flux-text-muted)] py-6">{t("loading")}</p>
      ) : !boardId ? (
        <FluxEmptyState title={t("emptyNoBoards")} description={t("emptyNoBoardsHint")} />
      ) : mode === "calendar" ? (
        <CalendarMonthView
          boardId={boardId}
          cards={cards}
          sprints={sprints}
          year={y}
          month1to12={m}
          onMonthChange={(ny, nm) => {
            setY(ny);
            setM(nm);
          }}
          todayKey={todayKey}
          assigneeNameById={assigneeNameById}
        />
      ) : mode === "manager" ? (
        <CalendarManagerView
          boardId={boardId}
          cards={cards}
          sprints={sprints}
          sprint={sprintObj}
          members={members}
          nowMs={nowMs}
          assigneeNameById={assigneeNameById}
        />
      ) : (
        <CalendarScheduleView
          boardId={boardId}
          sprints={sprints}
          cards={cards}
          nowMs={nowMs}
          assigneeNameById={assigneeNameById}
        />
      )}
    </CalendarHubLayout>
  );
}

export function CalendarHubPage() {
  const t = useTranslations("deliveryCalendar");
  return (
    <Suspense
      fallback={<div className="p-6 text-sm text-[var(--flux-text-muted)]">{t("loading")}</div>}
    >
      <CalendarHubContent />
    </Suspense>
  );
}
