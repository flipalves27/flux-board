"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Command } from "cmdk";
import Fuse from "fuse.js";
import { useAuth } from "@/context/auth-context";
import { apiGet, ApiError } from "@/lib/api-client";
import { getBoardShortcuts } from "@/lib/board-shortcuts";
import { getRecentCards } from "@/lib/recent-cards";
import { getCommandHistory, pushCommandHistory } from "@/lib/command-palette-history";
import type { HistoryPaletteEntry, PaletteAction, PaletteCategory, PaletteItem } from "@/lib/command-palette-types";
import { parseNaturalLanguageCommand, type AiCommandResult } from "@/lib/command-palette-ai";
import type { BoardMethodology } from "@/lib/board-methodology";
import { isPlatformAdminSession } from "@/lib/rbac";

type BoardRow = { id: string; name: string; boardMethodology?: BoardMethodology };

function CategoryIcon({ kind }: { kind: NonNullable<PaletteItem["icon"]> }) {
  const common = "h-4 w-4 shrink-0 text-[var(--flux-text-muted)]";
  if (kind === "history") {
    return (
      <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }
  if (kind === "boards") {
    return (
      <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
        />
      </svg>
    );
  }
  if (kind === "cards") {
    return (
      <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h16" />
      </svg>
    );
  }
  if (kind === "actions") {
    return (
      <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    );
  }
  return (
    <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function inferCategoryFromAction(action: PaletteAction): Exclude<PaletteCategory, "history"> {
  switch (action.type) {
    case "navigate":
      return "navigation";
    case "board":
      return "boards";
    case "card":
      return "cards";
    case "newCard":
    case "newBoard":
    case "copilot":
    case "boardDeep":
    case "aiCommand":
      return "actions";
    default:
      return "navigation";
  }
}

function runAction(action: PaletteAction, localeRoot: string, router: ReturnType<typeof useRouter>) {
  switch (action.type) {
    case "navigate":
      router.push(`${localeRoot}${action.path}`);
      break;
    case "board":
      router.push(`${localeRoot}/board/${encodeURIComponent(action.boardId)}`);
      break;
    case "card":
      router.push(
        `${localeRoot}/board/${encodeURIComponent(action.boardId)}?card=${encodeURIComponent(action.cardId)}`
      );
      break;
    case "newCard":
      router.push(`${localeRoot}/board/${encodeURIComponent(action.boardId)}?newCard=1`);
      break;
    case "newBoard":
      router.push(`${localeRoot}/boards?newBoard=1`);
      break;
    case "copilot":
      router.push(`${localeRoot}/board/${encodeURIComponent(action.boardId)}?copilot=1`);
      break;
    case "boardDeep":
      router.push(`${localeRoot}/board/${encodeURIComponent(action.boardId)}?${action.query}`);
      break;
    case "aiCommand":
      if (action.boardId) {
        router.push(`${localeRoot}/board/${encodeURIComponent(action.boardId)}?copilot=1&q=${encodeURIComponent(action.command)}`);
      }
      break;
    default:
      break;
  }
}

function historyEntryToItem(h: HistoryPaletteEntry): PaletteItem {
  return {
    id: `hist:${h.id}`,
    category: "history",
    title: h.title,
    subtitle: h.subtitle,
    keywords: `${h.title} ${h.subtitle ?? ""}`,
    action: h.action,
    icon: "history",
  };
}

export function CommandPalette() {
  const router = useRouter();
  const locale = useLocale();
  const localeRoot = `/${locale}`;
  const { user, getHeaders, isChecked } = useAuth();
  const userRef = useRef(user);
  userRef.current = user;
  const getHeadersRef = useRef(getHeaders);
  getHeadersRef.current = getHeaders;

  const t = useTranslations("commandPalette");

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [historyState, setHistoryState] = useState<HistoryPaletteEntry[]>([]);
  const flatOrderRef = useRef<PaletteItem[]>([]);

  const loadBoards = useCallback(async () => {
    const u = userRef.current;
    if (!u) return;
    try {
      const data = await apiGet<{ boards: BoardRow[] }>("/api/boards", getHeadersRef.current());
      setBoards(Array.isArray(data.boards) ? data.boards : []);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setBoards([]);
        return;
      }
      setBoards([]);
    }
  }, []);

  useEffect(() => {
    if (!isChecked || !user?.id) return;
    setHistoryState(getCommandHistory(user.id));
  }, [isChecked, user?.id, open]);

  useEffect(() => {
    if (!open) return;
    void loadBoards();
  }, [open, loadBoards]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        const target = e.target as HTMLElement | null;
        if (target?.closest?.("[data-skip-command-palette]")) return;
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const boardById = useMemo(() => {
    const m = new Map<string, BoardRow>();
    for (const b of boards) m.set(b.id, b);
    return m;
  }, [boards]);

  const allItems = useMemo((): PaletteItem[] => {
    if (!user) return [];
    const items: PaletteItem[] = [];
    const shortcuts = getBoardShortcuts(user.id);
    const recentCards = getRecentCards(user.id);

    for (const b of boards) {
      const methodology = b.boardMethodology ?? "scrum";
      const isKanban = methodology === "kanban";
      const isScrum = methodology === "scrum";
      const isLss = methodology === "lean_six_sigma";
      items.push({
        id: `board:${b.id}`,
        category: "boards",
        title: b.name,
        subtitle: t("subtitles.openBoard"),
        keywords: `${b.name} board abrir board`,
        action: { type: "board", boardId: b.id },
        icon: "boards",
      });
      items.push({
        id: `newcard:${b.id}`,
        category: "actions",
        title: t("actions.createCardIn", { board: b.name }),
        subtitle: t("subtitles.newCard"),
        keywords: `criar card novo ${b.name} create card`,
        action: { type: "newCard", boardId: b.id },
        icon: "actions",
      });
      items.push({
        id: `flow:${b.id}`,
        category: "actions",
        title: t("actions.flowHealth", { board: b.name }),
        subtitle: t("subtitles.openBoard"),
        keywords: `fluxo saúde flow health wip kanban ${b.name}`,
        action: { type: "boardDeep", boardId: b.id, query: "flowHealth=1" },
        icon: "actions",
      });
      if (isKanban) {
        items.push({
          id: `kanbanCadence:${b.id}`,
          category: "actions",
          title: t("actions.kanbanCadence", { board: b.name }),
          subtitle: t("subtitles.openBoard"),
          keywords: `kanban cadência cerimônia fluxo ${b.name}`,
          action: { type: "boardDeep", boardId: b.id, query: "kanbanCadence=1" },
          icon: "actions",
        });
        items.push({
          id: `scrum:${b.id}`,
          category: "actions",
          title: t("actions.scrumSettings", { board: b.name }),
          subtitle: t("subtitles.openBoard"),
          keywords: `metodologia agile dod settings ${b.name}`,
          action: { type: "boardDeep", boardId: b.id, query: "scrumSettings=1" },
          icon: "actions",
        });
      } else if (isLss) {
        items.push({
          id: `lssAssist:${b.id}`,
          category: "actions",
          title: t("actions.lssAssist", { board: b.name }),
          subtitle: t("subtitles.openBoard"),
          keywords: `lean six sigma dmaic assistente lss ${b.name}`,
          action: { type: "boardDeep", boardId: b.id, query: "lssAssist=1" },
          icon: "actions",
        });
        items.push({
          id: `scrum:${b.id}`,
          category: "actions",
          title: t("actions.scrumSettings", { board: b.name }),
          subtitle: t("subtitles.openBoard"),
          keywords: `metodologia board settings ${b.name}`,
          action: { type: "boardDeep", boardId: b.id, query: "scrumSettings=1" },
          icon: "actions",
        });
      } else if (isScrum) {
        items.push({
          id: `sprintpanel:${b.id}`,
          category: "actions",
          title: t("actions.sprintPanel", { board: b.name }),
          subtitle: t("subtitles.openBoard"),
          keywords: `sprint painel scrum ${b.name}`,
          action: { type: "boardDeep", boardId: b.id, query: "sprintPanel=1" },
          icon: "actions",
        });
        items.push({
          id: `sprintcoach:${b.id}`,
          category: "actions",
          title: t("actions.sprintCoach", { board: b.name }),
          subtitle: t("subtitles.openBoard"),
          keywords: `coach sprint ia planning ${b.name}`,
          action: { type: "boardDeep", boardId: b.id, query: "sprintCoach=1" },
          icon: "actions",
        });
        items.push({
          id: `standup:${b.id}`,
          category: "actions",
          title: t("actions.standup", { board: b.name }),
          subtitle: t("subtitles.openBoard"),
          keywords: `standup daily cerimônia ${b.name}`,
          action: { type: "boardDeep", boardId: b.id, query: "standup=1" },
          icon: "actions",
        });
        items.push({
          id: `scrum:${b.id}`,
          category: "actions",
          title: t("actions.scrumSettings", { board: b.name }),
          subtitle: t("subtitles.openBoard"),
          keywords: `scrum dod product goal backlog ${b.name}`,
          action: { type: "boardDeep", boardId: b.id, query: "scrumSettings=1" },
          icon: "actions",
        });
        items.push({
          id: `increment:${b.id}`,
          category: "actions",
          title: t("actions.incrementReview", { board: b.name }),
          subtitle: t("subtitles.openBoard"),
          keywords: `increment review entregue sprint ${b.name}`,
          action: { type: "boardDeep", boardId: b.id, query: "incrementReview=1" },
          icon: "actions",
        });
      }
    }

    for (const rc of recentCards) {
      const bn = boardById.get(rc.boardId)?.name ?? rc.boardName;
      items.push({
        id: `card:${rc.boardId}:${rc.cardId}`,
        category: "cards",
        title: rc.title || rc.cardId,
        subtitle: bn,
        keywords: `${rc.title} ${rc.cardId} ${bn} card`,
        action: { type: "card", boardId: rc.boardId, cardId: rc.cardId },
        icon: "cards",
      });
    }

    items.push({
      id: "action:newBoard",
      category: "actions",
      title: t("actions.newBoard"),
      subtitle: t("subtitles.newBoard"),
      keywords: "criar board novo workspace",
      action: { type: "newBoard" },
      icon: "actions",
    });

    const copilotBoardId =
      shortcuts.recents[0]?.boardId ?? boards[0]?.id ?? null;
    if (copilotBoardId) {
      const bn = boardById.get(copilotBoardId)?.name ?? "";
      items.push({
        id: `action:copilot:${copilotBoardId}`,
        category: "actions",
        title: t("actions.copilot"),
        subtitle: bn ? t("subtitles.copilotOn", { board: bn }) : undefined,
        keywords: "copilot ia assistente ai",
        action: { type: "copilot", boardId: copilotBoardId },
        icon: "actions",
      });
    }

    const nav: { path: string; title: string; kw: string }[] = [
      { path: "/boards", title: t("nav.boards"), kw: "boards lista" },
      { path: "/reports", title: t("nav.reports"), kw: "reports bi" },
      ...(user.isAdmin || user.isExecutive
        ? [{ path: "/dashboard", title: t("nav.dashboard"), kw: "executive dashboard c-level portfolio health" }]
        : []),
      { path: "/okrs", title: t("nav.okrs"), kw: "goals okr" },
      { path: "/templates", title: t("nav.templates"), kw: "templates" },
      { path: "/tasks", title: t("nav.tasks"), kw: "tasks" },
      { path: "/my-work", title: t("nav.myWork"), kw: "my work meu trabalho workload pessoal" },
      { path: "/template-marketplace", title: t("nav.marketplace"), kw: "marketplace templates galeria" },
      { path: "/sprints", title: t("nav.sprints"), kw: "sprints sprint agile scrum" },
      { path: "/program-increments", title: "Program Increments (PI)", kw: "program increment pi safe agile multi-board sprint" },
      { path: "/docs", title: t("nav.docs"), kw: "docs documentos rag ai conhecimento" },
    ];
    if (user.isAdmin) {
      nav.push(
        { path: "/users", title: t("nav.users"), kw: "users members" },
        { path: "/org-settings", title: t("nav.orgSettings"), kw: "settings organization" },
        { path: "/billing", title: t("nav.billing"), kw: "billing plan" },
        { path: "/org-invites", title: t("nav.invites"), kw: "invites" }
      );
    }
    if (isPlatformAdminSession(user)) {
      nav.push(
        { path: "/rate-limit-abuse", title: t("nav.rateLimit"), kw: "rate limit abuse" },
        { path: "/admin/tracer", title: t("nav.tracer"), kw: "tracer diagnostics flux debug errors" }
      );
    }

    for (const n of nav) {
      items.push({
        id: `nav:${n.path}`,
        category: "navigation",
        title: n.title,
        subtitle: t("subtitles.navigate"),
        keywords: n.kw,
        action: { type: "navigate", path: n.path },
        icon: "navigation",
      });
    }

    return items;
  }, [boards, boardById, user, t]);

  const fuse = useMemo(() => {
    return new Fuse(allItems, {
      keys: [
        { name: "title", weight: 0.55 },
        { name: "subtitle", weight: 0.2 },
        { name: "keywords", weight: 0.35 },
      ],
      threshold: 0.48,
      ignoreLocation: true,
      minMatchCharLength: 1,
      includeScore: true,
    });
  }, [allItems]);

  const aiMode = search.trim().toLowerCase().startsWith("/ai") || search.trim().toLowerCase() === "ai";
  const aiPlaceholder = false;

  const aiParsedItems = useMemo((): PaletteItem[] => {
    if (!aiMode) return [];
    const query = search.replace(/^\/ai\s*/i, "").trim();
    if (query.length < 3) return [];
    const currentBoardId = boards[0]?.id;
    const result: AiCommandResult = parseNaturalLanguageCommand(query, {
      boardNames: boards.map((b) => b.name),
      columnNames: [],
      currentBoardId,
    });
    if (result.type === "unknown" || result.confidence < 0.5) return [];
    const action: PaletteAction =
      result.type === "navigate" && typeof result.params.path === "string"
        ? { type: "navigate", path: result.params.path }
        : result.type === "open_copilot" && currentBoardId
          ? { type: "copilot", boardId: currentBoardId }
          : { type: "aiCommand", command: query, boardId: currentBoardId };
    return [{
      id: `ai:${query}`,
      category: "actions",
      title: result.displayMessage || query,
      subtitle: t("aiAction"),
      keywords: query,
      action,
      icon: "actions",
    }];
  }, [aiMode, search, boards, t]);

  const filteredFlat = useMemo(() => {
    const q = search.trim();
    if (aiMode) return aiParsedItems;

    if (!q) {
      const hist = historyState.map(historyEntryToItem);
      const seen = new Set<string>();
      const out: PaletteItem[] = [];

      for (const h of hist) {
        out.push(h);
        seen.add(h.id);
        const a = h.action;
        if (a.type === "board") seen.add(`board:${a.boardId}`);
        else if (a.type === "card") seen.add(`card:${a.boardId}:${a.cardId}`);
        else if (a.type === "newCard") seen.add(`newcard:${a.boardId}`);
        else if (a.type === "newBoard") seen.add("action:newBoard");
        else if (a.type === "copilot") seen.add(`action:copilot:${a.boardId}`);
        else if (a.type === "boardDeep") seen.add(`deep:${a.boardId}:${a.query}`);
        else if (a.type === "navigate") seen.add(`nav:${a.path}`);
      }

      const shortcuts = user ? getBoardShortcuts(user.id) : { recents: [] as { boardId: string }[] };
      for (const r of shortcuts.recents) {
        const b = boardById.get(r.boardId);
        if (!b) continue;
        const id = `board:${b.id}`;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({
          id,
          category: "boards",
          title: b.name,
          subtitle: t("subtitles.openBoard"),
          keywords: b.name,
          action: { type: "board", boardId: b.id },
          icon: "boards",
        });
      }

      const recentCards = user ? getRecentCards(user.id) : [];
      for (const rc of recentCards.slice(0, 6)) {
        const id = `card:${rc.boardId}:${rc.cardId}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const bn = boardById.get(rc.boardId)?.name ?? rc.boardName;
        out.push({
          id,
          category: "cards",
          title: rc.title || rc.cardId,
          subtitle: bn,
          keywords: `${rc.title} ${bn}`,
          action: { type: "card", boardId: rc.boardId, cardId: rc.cardId },
          icon: "cards",
        });
      }

      const newCardCandidates = boards.slice(0, 3);
      for (const b of newCardCandidates) {
        const nid = `newcard:${b.id}`;
        if (seen.has(nid)) continue;
        const it = allItems.find((x) => x.id === nid);
        if (it) {
          seen.add(nid);
          out.push(it);
        }
      }

      for (const it of allItems) {
        if (out.length >= 56) break;
        if (seen.has(it.id)) continue;
        if (it.id.startsWith("newcard:")) continue;
        seen.add(it.id);
        out.push(it);
      }
      return out;
    }

    return fuse.search(q).map((r) => r.item);
  }, [search, allItems, fuse, historyState, user, boardById, t, aiPlaceholder, boards]);

  const grouped = useMemo(() => {
    const order: PaletteCategory[] = ["history", "boards", "cards", "actions", "navigation"];
    const map = new Map<PaletteCategory, PaletteItem[]>();
    for (const c of order) map.set(c, []);
    for (const item of filteredFlat) {
      map.get(item.category)?.push(item);
    }
    return order.map((c) => ({ category: c, items: map.get(c) ?? [] })).filter((g) => g.items.length > 0);
  }, [filteredFlat]);

  const { visualOrder, visualIndexById } = useMemo(() => {
    const order: PaletteCategory[] = ["history", "boards", "cards", "actions", "navigation"];
    const visual: PaletteItem[] = [];
    for (const c of order) {
      for (const item of filteredFlat) {
        if (item.category === c) visual.push(item);
      }
    }
    const m = new Map<string, number>();
    visual.forEach((item, i) => m.set(item.id, i));
    return { visualOrder: visual, visualIndexById: m };
  }, [filteredFlat]);

  useEffect(() => {
    flatOrderRef.current = visualOrder;
  }, [visualOrder]);

  const categoryLabel = useCallback(
    (c: PaletteCategory) => {
      switch (c) {
        case "history":
          return t("groups.recent");
        case "boards":
          return t("groups.boards");
        case "cards":
          return t("groups.cards");
        case "actions":
          return t("groups.actions");
        case "navigation":
          return t("groups.navigation");
        default:
          return c;
      }
    },
    [t]
  );

  const execute = useCallback(
    (item: PaletteItem) => {
      if (!user) return;
      runAction(item.action, localeRoot, router);
      const hist: HistoryPaletteEntry = {
        id: item.id.replace(/^hist:/, ""),
        category: item.category === "history" ? inferCategoryFromAction(item.action) : item.category,
        title: item.title,
        subtitle: item.subtitle,
        action: item.action,
      };
      setHistoryState(pushCommandHistory(user.id, hist));
      setOpen(false);
      setSearch("");
    },
    [user, localeRoot, router]
  );

  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) setSearch("");
  }, []);

  const onInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (aiPlaceholder) return;
      if (!/^[1-9]$/.test(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
      const list = flatOrderRef.current;
      const idx = parseInt(e.key, 10) - 1;
      if (list[idx]) {
        e.preventDefault();
        execute(list[idx]);
      }
    },
    [execute, aiPlaceholder]
  );

  if (!isChecked || !user) return null;

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      shouldFilter={false}
      label={t("ariaLabel")}
      overlayClassName="fixed inset-0 z-[var(--flux-z-command-backdrop)] bg-black/55 backdrop-blur-[2px]"
      contentClassName="fixed left-1/2 top-[min(18vh,160px)] z-[var(--flux-z-command-content)] w-[min(560px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-[var(--flux-rad)] border border-[var(--flux-border-default)] bg-[var(--flux-surface-card)] shadow-[var(--flux-shadow-lg)]"
    >
      <div className="border-b border-[var(--flux-chrome-alpha-08)] px-3 py-2">
        <div className="flex items-center gap-2">
          <svg
            className="h-4 w-4 shrink-0 text-[var(--flux-text-muted)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <Command.Input
            value={search}
            onValueChange={setSearch}
            onKeyDown={onInputKeyDown}
            placeholder={t("placeholder")}
            className="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm text-[var(--flux-text)] outline-none placeholder:text-[var(--flux-text-muted)]"
          />
          <kbd className="hidden shrink-0 rounded border border-[var(--flux-control-border)] bg-[var(--flux-surface-dark)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--flux-text-muted)] sm:inline">
            Esc
          </kbd>
        </div>
      </div>

      <Command.List className="max-h-[min(420px,55vh)] overflow-y-auto overscroll-contain px-1 py-2 scrollbar-kanban">
        {aiMode && aiParsedItems.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-[var(--flux-text-muted)]">{t("aiHint")}</div>
        ) : filteredFlat.length === 0 ? (
          <Command.Empty className="py-8 text-center text-sm text-[var(--flux-text-muted)]">{t("empty")}</Command.Empty>
        ) : (
          grouped.map((g) => (
            <Command.Group
              key={g.category}
              heading={
                <span className="px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--flux-text-muted)]">
                  {categoryLabel(g.category)}
                </span>
              }
              className="mb-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
            >
              {g.items.map((item) => {
                const globalIdx = visualIndexById.get(item.id) ?? -1;
                const badge = globalIdx >= 0 && globalIdx < 9 ? String(globalIdx + 1) : null;
                return (
                  <Command.Item
                    key={item.id}
                    value={item.id}
                    keywords={[item.keywords]}
                    onSelect={() => execute(item)}
                    className="flex cursor-pointer items-center gap-2 rounded-[var(--flux-rad-sm)] px-2 py-2 text-left text-sm aria-selected:bg-[var(--flux-primary-alpha-14)] aria-selected:text-[var(--flux-text)]"
                  >
                    <CategoryIcon kind={item.icon ?? "navigation"} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-[var(--flux-text)]">{item.title}</div>
                      {item.subtitle ? (
                        <div className="truncate text-xs text-[var(--flux-text-muted)]">{item.subtitle}</div>
                      ) : null}
                    </div>
                    {badge ? (
                      <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded border border-[var(--flux-control-border)] font-mono text-[10px] text-[var(--flux-text-muted)]">
                        {badge}
                      </span>
                    ) : null}
                  </Command.Item>
                );
              })}
            </Command.Group>
          ))
        )}
      </Command.List>

      <div className="border-t border-[var(--flux-chrome-alpha-08)] px-3 py-2 text-[10px] text-[var(--flux-text-muted)]">
        {t("footer")}
      </div>
    </Command.Dialog>
  );
}
