"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { useLocale, useTranslations } from "next-intl";
import { Header } from "@/components/header";
import { apiGet, apiPost, apiPut, apiDelete, ApiError } from "@/lib/api-client";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/context/toast-context";
import {
  getOnboardingDoneStorageKey,
  getOrganizationInvitesOnboardingDoneStorageKey,
  getOrganizationOnboardingDoneStorageKey,
} from "@/lib/onboarding";
import {
  clearRecentBoards,
  cleanupBoardShortcuts,
  getBoardShortcuts,
  registerBoardVisit,
  toggleBoardFavorite,
  type BoardVisitEntry,
} from "@/lib/board-shortcuts";
import { cleanupRecentCards } from "@/lib/recent-cards";
import {
  averageNullable,
  type BoardPortfolioMetrics,
} from "@/lib/board-portfolio-metrics";
import { FluxCapabilityStrip } from "@/components/boards/flux-capability-strip";
import { FluxAiHub } from "@/components/boards/flux-ai-hub";
import { useMinimumSkeletonDuration } from "@/lib/use-minimum-skeleton-duration";
import { DataFadeIn } from "@/components/ui/data-fade-in";
import { FluxEmptyState } from "@/components/ui/flux-empty-state";
import { SkeletonBoardList } from "@/components/skeletons/flux-skeletons";
import { BoardsRouteLoadingFallback } from "@/components/skeletons/route-loading-fallbacks";
import type { BoardMethodology } from "@/lib/board-methodology";
import { sessionCanManageMembersAndBilling } from "@/lib/rbac";

interface Board {
  id: string;
  name: string;
  ownerId: string;
  clientLabel?: string;
  lastUpdated?: string;
  boardMethodology?: BoardMethodology;
  portfolio?: BoardPortfolioMetrics;
}

interface PlanInfo {
  maxBoards: number | null;
  isPro: boolean;
  currentCount: number;
  atLimit: boolean;
}

function PortfolioMetricBar({ label, value }: { label: string; value: number | null }) {
  const fillClass =
    value === null
      ? ""
      : value >= 72
        ? "bg-[var(--flux-success)]"
        : value >= 48
          ? "bg-[var(--flux-warning)]"
          : "bg-[var(--flux-danger)]";
  return (
    <div className="space-y-0.5 min-w-0">
      <div className="flex justify-between gap-2 text-[10px] text-[var(--flux-text-muted)]">
        <span className="truncate">{label}</span>
        <span className="shrink-0 font-mono tabular-nums text-[var(--flux-text)]">
          {value !== null ? value : "—"}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--flux-chrome-alpha-08)]">
        {value !== null && (
          <div className={`h-full rounded-full transition-all ${fillClass}`} style={{ width: `${value}%` }} />
        )}
      </div>
    </div>
  );
}

export default function BoardsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, getHeaders, isChecked } = useAuth();
  const locale = useLocale();
  const t = useTranslations("boards");
  const localeRoot = `/${locale}`;
  const dateLocale = locale === "en" ? "en-US" : "pt-BR";
  const [boards, setBoards] = useState<Board[]>([]);
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"new" | "edit">("new");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [boardName, setBoardName] = useState("");
  const [createMethodology, setCreateMethodology] = useState<BoardMethodology>("scrum");
  const [empty, setEmpty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<"recent" | "name">("recent");
  const [showOnlyUpdatedToday, setShowOnlyUpdatedToday] = useState(false);
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [favoriteSortMode, setFavoriteSortMode] = useState<"name" | "mostAccessed">("name");
  const [favoriteBoardIds, setFavoriteBoardIds] = useState<string[]>([]);
  const [recentEntries, setRecentEntries] = useState<BoardVisitEntry[]>([]);
  const [activeTab, setActiveTab] = useState<"myBoards" | "analytics">("myBoards");
  const [visitCounts, setVisitCounts] = useState<Record<string, number>>({});
  const { pushToast } = useToast();

  const authWaiting = !isChecked || !user;
  const showListSkeleton = useMinimumSkeletonDuration(!authWaiting && loading);

  useEffect(() => {
    if (!isChecked) return;
    if (!user) {
      router.replace(`${localeRoot}/login`);
      return;
    }
    loadBoards();
  }, [isChecked, user, router]);

  useEffect(() => {
    if (!isChecked || !user) return;
    const billing = searchParams.get("billing");
    if (billing === "success") {
      pushToast({ kind: "success", title: "Assinatura ativa!", description: "Seus recursos Pro/Business já devem estar disponíveis." });
    } else if (billing === "cancel") {
      pushToast({ kind: "warning", title: "Checkout cancelado", description: "Nenhuma assinatura foi criada." });
    }
  }, [searchParams, isChecked, user, pushToast]);

  useEffect(() => {
    if (!isChecked || !user) return;
    if (loading) return;
    if (!empty) return;
    try {
      const boardDoneKey = getOnboardingDoneStorageKey(user.id);
      if (localStorage.getItem(boardDoneKey) === "1") return;

      if (!(user.isAdmin || user.isExecutive || sessionCanManageMembersAndBilling(user))) {
        router.replace(`${localeRoot}/onboarding`);
        return;
      }

      const orgDoneKey = getOrganizationOnboardingDoneStorageKey(user.id);
      const invitesDoneKey = getOrganizationInvitesOnboardingDoneStorageKey(user.id);

      if (localStorage.getItem(orgDoneKey) !== "1") {
        router.replace(`${localeRoot}/onboarding-org`);
        return;
      }
      if (localStorage.getItem(invitesDoneKey) !== "1") {
        router.replace(`${localeRoot}/onboarding-invites`);
        return;
      }

      router.replace(`${localeRoot}/onboarding`);
    } catch {
      // ignore localStorage read errors
    }
  }, [empty, isChecked, loading, router, user]);

  async function loadBoards() {
    try {
      const data = await apiGet<{ boards: Board[]; plan?: PlanInfo }>("/api/boards", getHeaders());
      const list = data.boards ?? [];
      setBoards(list);
      setPlan(data.plan ?? null);
      setEmpty(list.length === 0);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.replace(`${localeRoot}/login`);
        return;
      }
      setBoards([]);
      setEmpty(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user || boards.length === 0) return;
    cleanupBoardShortcuts(
      user.id,
      boards.map((board) => board.id)
    );
    cleanupRecentCards(
      user.id,
      new Set(boards.map((b) => b.id))
    );
    const shortcuts = getBoardShortcuts(user.id);
    setFavoriteBoardIds(shortcuts.favorites);
    setRecentEntries(shortcuts.recents);
    setVisitCounts(shortcuts.visitCounts);
  }, [user, boards]);

  function openNewModal() {
    setModalMode("new");
    setEditingId(null);
    setBoardName("");
    setCreateMethodology("scrum");
    setModalOpen(true);
  }

  useEffect(() => {
    if (!isChecked || !user) return;
    if (searchParams.get("newBoard") !== "1") return;
    setModalMode("new");
    setEditingId(null);
    setBoardName("");
    setCreateMethodology("scrum");
    setModalOpen(true);
    router.replace(`${localeRoot}/boards`, { scroll: false });
  }, [searchParams, isChecked, user, router, localeRoot]);

  function openEditModal(id: string, name: string) {
    setModalMode("edit");
    setEditingId(id);
    setBoardName(name);
    setModalOpen(true);
  }

  async function createBoard() {
    try {
      const name = boardName.trim() || t("defaults.newBoardName");
      const wasFirstBoard = boards.length === 0;
      const { board } = await apiPost<{ board: Board }>(
        "/api/boards",
        { name, boardMethodology: createMethodology },
        getHeaders()
      );
      setModalOpen(false);
      router.push(`${localeRoot}/board/${board.id}${wasFirstBoard ? "?tour=1" : ""}`);
    } catch {
      pushToast({ kind: "error", title: "Erro ao criar board." });
    }
  }

  async function saveBoardName() {
    if (!editingId) return;
    try {
      const name = boardName.trim() || "Board";
      await apiPut(`/api/boards/${editingId}`, { name }, getHeaders());
      setModalOpen(false);
      loadBoards();
    } catch {
      pushToast({ kind: "error", title: "Erro ao renomear." });
    }
  }

  async function deleteBoard(id: string, name: string) {
    setConfirmDelete({ id, name });
  }

  function formatDate(s?: string) {
    if (!s) return "-";
    try {
      return new Date(s).toLocaleDateString(dateLocale, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return s;
    }
  }

  function parseDateSafe(value?: string) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function toDateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  const [todayKey, setTodayKey] = useState("");
  useEffect(() => {
    setTodayKey(toDateKey(new Date()));
  }, []);

  const boardsUpdatedToday = useMemo(
    () => boards.filter((b) => {
      if (!todayKey) return false;
      const d = parseDateSafe(b.lastUpdated);
      return d ? toDateKey(d) === todayKey : false;
    }),
    [boards, todayKey]
  );

  const portfolioSummary = useMemo(() => {
    const withCards = boards.filter((b) => (b.portfolio?.cardCount ?? 0) > 0);
    if (withCards.length === 0) {
      return {
        avgRisco: null as number | null,
        avgThroughput: null as number | null,
        avgPrevisibilidade: null as number | null,
        atRisk: 0,
        withCards: 0,
      };
    }
    return {
      avgRisco: averageNullable(withCards.map((b) => b.portfolio!.risco)),
      avgThroughput: averageNullable(withCards.map((b) => b.portfolio!.throughput)),
      avgPrevisibilidade: averageNullable(withCards.map((b) => b.portfolio!.previsibilidade)),
      atRisk: withCards.filter((b) => (b.portfolio!.risco ?? 100) < 48).length,
      withCards: withCards.length,
    };
  }, [boards]);

  const visibleBoards = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    let list = boards.filter((b) => {
      if (!normalized) return true;
      return b.name.toLowerCase().includes(normalized) || b.id.toLowerCase().includes(normalized);
    });

    if (showOnlyUpdatedToday) {
      list = list.filter((b) => {
        if (!todayKey) return false;
        const d = parseDateSafe(b.lastUpdated);
        return d ? toDateKey(d) === todayKey : false;
      });
    }
    if (showOnlyFavorites) {
      const favoriteIds = new Set(favoriteBoardIds);
      list = list.filter((b) => favoriteIds.has(b.id));
    }

    const sorted = [...list];
    if (sortMode === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name, dateLocale));
    } else {
      sorted.sort((a, b) => {
        const ad = parseDateSafe(a.lastUpdated)?.getTime() ?? 0;
        const bd = parseDateSafe(b.lastUpdated)?.getTime() ?? 0;
        return bd - ad;
      });
    }
    return sorted;
  }, [boards, query, sortMode, showOnlyUpdatedToday, showOnlyFavorites, favoriteBoardIds, todayKey, dateLocale]);

  const quickFavoriteBoards = useMemo(() => {
    const favoriteIds = new Set(favoriteBoardIds);
    const list = boards.filter((board) => favoriteIds.has(board.id));
    if (favoriteSortMode === "mostAccessed") {
      return list.sort((a, b) => {
        const aCount = visitCounts[a.id] ?? 0;
        const bCount = visitCounts[b.id] ?? 0;
        if (bCount !== aCount) return bCount - aCount;
        return a.name.localeCompare(b.name, dateLocale);
      });
    }
    return list.sort((a, b) => a.name.localeCompare(b.name, dateLocale));
  }, [boards, favoriteBoardIds, favoriteSortMode, visitCounts, dateLocale]);
  const favoriteModeLabel =
    favoriteSortMode === "mostAccessed" ? t("favoriteModes.mostAccessed") : t("favoriteModes.nameAZ");

  const quickRecentBoards = useMemo(() => {
    if (recentEntries.length === 0) return [];
    const byId = new Map(boards.map((board) => [board.id, board]));
    return recentEntries
      .map((entry) => {
        const board = byId.get(entry.boardId);
        return board ? { board, visitedAt: entry.visitedAt } : null;
      })
      .filter((item): item is { board: Board; visitedAt: string } => item !== null);
  }, [boards, recentEntries]);

  function handleOpenBoard(boardId: string) {
    if (user) {
      setRecentEntries(registerBoardVisit(user.id, boardId));
      setVisitCounts(getBoardShortcuts(user.id).visitCounts);
    }
    router.push(`${localeRoot}/board/${boardId}`);
  }

  function handleToggleFavorite(boardId: string) {
    if (!user) return;
    setFavoriteBoardIds(toggleBoardFavorite(user.id, boardId));
  }

  function handleClearRecents() {
    if (!user) return;
    setRecentEntries(clearRecentBoards(user.id));
  }

  if (authWaiting) {
    return <BoardsRouteLoadingFallback />;
  }

  return (
    <div className="min-h-screen bg-[var(--flux-surface-dark)]">
      <Header />
      <main className="max-w-[1200px] mx-auto px-6 py-8">
        <header className="mb-6 border-b border-[var(--flux-chrome-alpha-12)] pb-6">
          <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--flux-text)]">
            {t("pageTitle")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--flux-text-muted)]">
            {t("pageSubtitle")}
          </p>
        </header>

        <div className="flex gap-1 border-b border-[var(--flux-chrome-alpha-08)] mb-6">
          <button
            className={`px-4 py-2.5 text-sm font-semibold font-display transition-colors ${activeTab === "myBoards" ? "text-[var(--flux-primary-light)] border-b-2 border-[var(--flux-primary)]" : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"}`}
            onClick={() => setActiveTab("myBoards")}
          >
            {t("tabs.myBoards")}
          </button>
          <button
            className={`px-4 py-2.5 text-sm font-semibold font-display transition-colors ${activeTab === "analytics" ? "text-[var(--flux-primary-light)] border-b-2 border-[var(--flux-primary)]" : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"}`}
            onClick={() => setActiveTab("analytics")}
          >
            {t("tabs.analytics")}
          </button>
        </div>

        {plan && plan.maxBoards !== null && !plan.isPro && (
          <div
            className={`mb-6 rounded-[var(--flux-rad)] border px-4 py-3 text-sm ${
              plan.atLimit
                ? "border-[var(--flux-warning)] bg-[var(--flux-amber-alpha-12)] text-[var(--flux-text)]"
                : "border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] text-[var(--flux-text-muted)]"
            }`}
          >
            {plan.atLimit ? (
              <>
                <span className="font-display font-bold text-[var(--flux-text)]">Limite do plano.</span>{" "}
                Você atingiu {plan.maxBoards} board(s). Remova um board ou{" "}
                <a
                  href={`${localeRoot}/billing`}
                  className="text-[var(--flux-primary-light)] underline underline-offset-2 hover:text-[var(--flux-primary)]"
                >
                  aumente seu limite no Stripe
                </a>
                .
              </>
            ) : (
              <>
                Plano atual: até <strong className="text-[var(--flux-text)]">{plan.maxBoards}</strong> boards no seu
                espaço ({plan.currentCount} em uso).{" "}
                <a href={`${localeRoot}/billing`} className="text-[var(--flux-primary-light)] underline-offset-2 hover:underline">
                  Ver planos e limites
                </a>
              </>
            )}
          </div>
        )}

        {showListSkeleton ? (
          <SkeletonBoardList />
        ) : (
          <DataFadeIn active>
            <>
            {activeTab === "myBoards" && (
              <>
                {user ? (
                  <FluxAiHub
                    localeRoot={localeRoot}
                    isExec={Boolean(user.isAdmin || user.isExecutive)}
                  />
                ) : null}
                <section className="mb-6 space-y-3" aria-labelledby="boards-search-heading">
                  <h2 id="boards-search-heading" className="font-display text-sm font-bold text-[var(--flux-text)]">
                    {t("sections.search")}
                  </h2>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_auto_auto]">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("filters.searchPlaceholder")}
                    className="w-full rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-3 py-2 text-sm text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] outline-none focus:border-[var(--flux-primary)]"
                  />
                  <select
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as "recent" | "name")}
                    className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] px-3 py-2 text-sm text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                    aria-label={t("filters.sortAriaLabel")}
                  >
                    <option value="recent">{t("filters.sort.recent")}</option>
                    <option value="name">{t("filters.sort.nameAZ")}</option>
                  </select>
                  <button
                    onClick={() => setShowOnlyUpdatedToday((v) => !v)}
                    className={`rounded-[var(--flux-rad)] border px-3 py-2 text-sm transition-colors ${
                      showOnlyUpdatedToday
                        ? "border-[var(--flux-secondary)] bg-[var(--flux-secondary-alpha-12)] text-[var(--flux-secondary)]"
                        : "border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
                    }`}
                  >
                    {showOnlyUpdatedToday ? "Somente hoje: ON" : "Somente hoje: OFF"}
                  </button>
                  <button
                    onClick={() => setShowOnlyFavorites((v) => !v)}
                    className={`rounded-[var(--flux-rad)] border px-3 py-2 text-sm transition-colors ${
                      showOnlyFavorites
                        ? "border-[var(--flux-gold-alpha-50)] bg-[var(--flux-gold-alpha-12)] text-[var(--flux-text)]"
                        : "border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
                    }`}
                  >
                    {showOnlyFavorites ? "Só favoritos: ON" : "Só favoritos: OFF"}
                  </button>
                  </div>
                </section>

                {(quickFavoriteBoards.length > 0 || quickRecentBoards.length > 0) && (
                  <section className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <div className="rounded-[var(--flux-rad)] border border-[var(--flux-gold-alpha-25)] bg-[var(--flux-surface-card)] p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="font-display text-sm font-bold text-[var(--flux-text)]">
                          {t("favorites.title")}
                          <span className="ml-1 font-normal text-[11px] text-[var(--flux-text-muted)]">
                            {" "}
                            · {favoriteModeLabel}
                          </span>
                        </h3>
                        <div className="flex items-center gap-2">
                          <select
                            value={favoriteSortMode}
                            onChange={(e) => setFavoriteSortMode(e.target.value as "name" | "mostAccessed")}
                            className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-2 py-1 text-xs text-[var(--flux-text)] outline-none focus:border-[var(--flux-primary)]"
                            aria-label={t("favorites.sortAriaLabel")}
                          >
                            <option value="name">{t("favorites.sort.nameAZ")}</option>
                            <option value="mostAccessed">{t("favorites.sort.mostAccessed")}</option>
                          </select>
                          <span className="text-xs text-[var(--flux-text-muted)]">{quickFavoriteBoards.length}</span>
                        </div>
                      </div>
                      {quickFavoriteBoards.length === 0 ? (
                        <p className="text-xs text-[var(--flux-text-muted)]">
                          Clique na estrela de um board para fixar aqui.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {quickFavoriteBoards.map((board) => (
                            <button
                              key={board.id}
                              onClick={() => handleOpenBoard(board.id)}
                              className="rounded-full border border-[var(--flux-gold-alpha-25)] bg-[var(--flux-gold-alpha-10)] px-3 py-1 text-xs font-semibold text-[var(--flux-text)] hover:border-[var(--flux-gold-alpha-48)]"
                            >
                              {board.name}
                              {favoriteSortMode === "mostAccessed" && (
                                <span className="ml-1 text-[10px] text-[var(--flux-text-muted)]">
                                  ({visitCounts[board.id] ?? 0})
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-25)] bg-[var(--flux-surface-card)] p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="font-display text-sm font-bold text-[var(--flux-text)]">
                          {t("recents.title")}
                        </h3>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleClearRecents}
                            className="rounded-[var(--flux-rad)] border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] px-2 py-1 text-xs text-[var(--flux-text-muted)] transition-colors hover:border-[var(--flux-primary)] hover:text-[var(--flux-text)]"
                          >
                            {t("recents.clear")}
                          </button>
                          <span className="text-xs text-[var(--flux-text-muted)]">{quickRecentBoards.length}</span>
                        </div>
                      </div>
                      {quickRecentBoards.length === 0 ? (
                        <p className="text-xs text-[var(--flux-text-muted)]">
                          Os boards abertos por ultimo aparecem aqui.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {quickRecentBoards.map(({ board, visitedAt }) => (
                            <button
                              key={`${board.id}-${visitedAt}`}
                              onClick={() => handleOpenBoard(board.id)}
                              className="rounded-full border border-[var(--flux-primary-alpha-28)] bg-[var(--flux-primary-alpha-11)] px-3 py-1 text-xs font-semibold text-[var(--flux-text)] hover:border-[var(--flux-primary)]"
                              title={`Ultimo acesso: ${formatDate(visitedAt)}`}
                            >
                              {board.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>
                )}

                <section className="space-y-4" aria-labelledby="boards-grid-heading">
                  <h2 id="boards-grid-heading" className="font-display text-sm font-bold text-[var(--flux-text)]">
                    {t("sections.yourBoards")}
                  </h2>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
                  <button
                    onClick={openNewModal}
                    className="bg-[var(--flux-surface-card)] border-2 border-dashed border-[var(--flux-primary-alpha-30)] flex items-center justify-center min-h-[120px] text-[var(--flux-text-muted)] font-semibold rounded-[var(--flux-rad)] hover:bg-[var(--flux-primary-alpha-08)] hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)] transition-all duration-200 cursor-pointer font-display"
                  >
                    {t("actions.newBoard")}
                  </button>
                  {visibleBoards.map((b) => {
                    const wasUpdatedToday = (() => {
                      if (!todayKey) return false;
                      const d = parseDateSafe(b.lastUpdated);
                      return d ? toDateKey(d) === todayKey : false;
                    })();
                    return (
                      <div
                        key={b.id}
                        className="bg-[var(--flux-surface-card)] border border-[var(--flux-primary-alpha-20)] rounded-[var(--flux-rad)] p-5 flex flex-col gap-2 cursor-pointer transition-all hover:shadow-[var(--shadow-md)] hover:border-[var(--flux-primary)]"
                        onClick={() => handleOpenBoard(b.id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-display font-bold text-[var(--flux-text)]">{b.name}</h3>
                              {b.boardMethodology === "kanban" ? (
                                <span className="shrink-0 rounded-full border border-[var(--flux-accent-alpha-35)] bg-[var(--flux-accent-alpha-10)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-accent)]">
                                  Kanban
                                </span>
                              ) : b.boardMethodology === "scrum" ? (
                                <span className="shrink-0 rounded-full border border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-10)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-primary-light)]">
                                  Scrum
                                </span>
                              ) : b.boardMethodology === "lean_six_sigma" ? (
                                <span className="shrink-0 rounded-full border border-[var(--flux-secondary-alpha-35)] bg-[var(--flux-secondary-alpha-10)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-secondary)]">
                                  LSS
                                </span>
                              ) : null}
                            </div>
                            {b.clientLabel ? (
                              <span className="mt-1 inline-block max-w-full truncate rounded-full border border-[var(--flux-secondary-alpha-35)] bg-[var(--flux-secondary-alpha-10)] px-2 py-0.5 text-[10px] font-semibold text-[var(--flux-secondary)]">
                                {b.clientLabel}
                              </span>
                            ) : null}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleFavorite(b.id);
                            }}
                            className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                              favoriteBoardIds.includes(b.id)
                                ? "border-[var(--flux-gold-alpha-50)] bg-[var(--flux-gold-alpha-15)] text-[var(--flux-text)]"
                                : "border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
                            }`}
                            aria-label={favoriteBoardIds.includes(b.id) ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                            title={favoriteBoardIds.includes(b.id) ? "Desfavoritar" : "Favoritar"}
                          >
                            {favoriteBoardIds.includes(b.id) ? "★" : "☆"}
                          </button>
                        </div>
                        {b.portfolio && b.portfolio.cardCount > 0 ? (
                          <div className="space-y-2 rounded-lg border border-[var(--flux-chrome-alpha-08)] bg-[var(--flux-surface-elevated)]/80 p-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
                              Score do board
                            </p>
                            <PortfolioMetricBar label="Risco" value={b.portfolio.risco} />
                            <PortfolioMetricBar label="Throughput" value={b.portfolio.throughput} />
                            <PortfolioMetricBar label="Previsibilidade" value={b.portfolio.previsibilidade} />
                          </div>
                        ) : (
                          <p className="text-[11px] text-[var(--flux-text-muted)]">
                            Sem itens ainda — os índices aparecem quando houver cards.
                          </p>
                        )}
                        <span className="text-xs text-[var(--flux-text-muted)]">
                          Atualizado: {formatDate(b.lastUpdated)}
                        </span>
                        {wasUpdatedToday && (
                          <span className="w-fit rounded-full border border-[var(--flux-secondary-alpha-38)] bg-[var(--flux-secondary-alpha-12)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--flux-secondary)]">
                            Hoje
                          </span>
                        )}
                        <div className="mt-auto pt-3 flex gap-3">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditModal(b.id, b.name);
                              }}
                              className="btn-sm border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)] hover:bg-[var(--flux-primary-alpha-10)] hover:border-[var(--flux-primary)] hover:text-[var(--flux-primary-light)]"
                            >
                              Renomear
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteBoard(b.id, b.name);
                              }}
                              className="btn-sm border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-elevated)] text-[var(--flux-text-muted)] hover:bg-[var(--flux-danger-alpha-12)] hover:border-[var(--flux-danger)] hover:text-[var(--flux-danger)]"
                            >
                              Excluir
                            </button>
                          </div>
                      </div>
                    );
                  })}
                </div>
                {empty && boards.length === 0 && (
                  <FluxEmptyState
                    className="py-10"
                    title={t("sections.yourBoards")}
                    description={t("empty.noBoards", { newBoardName: t("defaults.newBoardName") })}
                  />
                )}
                {!empty && boards.length > 0 && visibleBoards.length === 0 && (
                  <FluxEmptyState
                    className="py-10"
                    title={t("sections.search")}
                    description={t("empty.noResults")}
                  />
                )}
                </section>

                <FluxCapabilityStrip compact />
              </>
            )}

            {activeTab === "analytics" && (
              <>
                <section className="mb-6 space-y-3" aria-labelledby="boards-snapshot-heading">
                  <h2 id="boards-snapshot-heading" className="font-display text-sm font-bold text-[var(--flux-text)]">
                    {t("sections.snapshot")}
                  </h2>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-22)] bg-[var(--flux-surface-card)] p-4">
                    <p className="text-xs font-semibold text-[var(--flux-text-muted)]">Total de boards</p>
                    <p className="mt-1 font-display text-2xl text-[var(--flux-text)]">{boards.length}</p>
                  </div>
                  <div className="rounded-[var(--flux-rad)] border border-[var(--flux-secondary-alpha-28)] bg-[var(--flux-surface-card)] p-4">
                    <p className="text-xs font-semibold text-[var(--flux-text-muted)]">Atualizados hoje</p>
                    <p className="mt-1 font-display text-2xl text-[var(--flux-text)]">{boardsUpdatedToday.length}</p>
                  </div>
                  </div>
                </section>

                <section className="mb-8 rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-28)] bg-[var(--flux-surface-card)] p-5">
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h3 className="font-display text-sm font-bold text-[var(--flux-text)]">
                        Dashboard executivo · Portfólio
                      </h3>
                      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[var(--flux-text-muted)]">
                        Índices de 0 a 100 por board (quanto maior, melhor).{" "}
                        <strong className="font-semibold text-[var(--flux-text)]">Risco</strong> sintetiza atrasos, urgências
                        em aberto e pressão de WIP; <strong className="font-semibold text-[var(--flux-text)]">Throughput</strong>{" "}
                        combina concluídos e avanço nas colunas;{" "}
                        <strong className="font-semibold text-[var(--flux-text)]">Previsibilidade</strong> reflete o respeito a
                        prazos nos itens em aberto.
                      </p>
                    </div>
                    {portfolioSummary.withCards > 0 ? (
                      <p className="shrink-0 text-xs text-[var(--flux-text-muted)]">
                        Médias sobre {portfolioSummary.withCards} board{portfolioSummary.withCards !== 1 ? "s" : ""} com itens
                        {portfolioSummary.atRisk > 0 && (
                          <span className="mt-1 block text-[var(--flux-danger)] sm:mt-0 sm:ml-2 sm:inline">
                            · {portfolioSummary.atRisk} com risco &lt; 48 (atenção)
                          </span>
                        )}
                      </p>
                    ) : (
                      <p className="shrink-0 text-xs text-[var(--flux-text-muted)]">
                        Adicione cards aos boards para ver médias agregadas.
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="rounded-[var(--flux-rad)] border border-[var(--flux-danger-alpha-20)] bg-[var(--flux-surface-elevated)] p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
                        Risco
                      </p>
                      <p className="mt-1 text-[10px] text-[var(--flux-text-muted)]">Menor exposição · melhor</p>
                      <p className="mt-2 font-display text-3xl tabular-nums text-[var(--flux-text)]">
                        {portfolioSummary.avgRisco ?? "—"}
                      </p>
                      <div className="mt-3">
                        <PortfolioMetricBar label="Média do portfólio" value={portfolioSummary.avgRisco} />
                      </div>
                    </div>
                    <div className="rounded-[var(--flux-rad)] border border-[var(--flux-secondary-alpha-25)] bg-[var(--flux-surface-elevated)] p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
                        Throughput
                      </p>
                      <p className="mt-1 text-[10px] text-[var(--flux-text-muted)]">Entrega e fluxo</p>
                      <p className="mt-2 font-display text-3xl tabular-nums text-[var(--flux-text)]">
                        {portfolioSummary.avgThroughput ?? "—"}
                      </p>
                      <div className="mt-3">
                        <PortfolioMetricBar label="Média do portfólio" value={portfolioSummary.avgThroughput} />
                      </div>
                    </div>
                    <div className="rounded-[var(--flux-rad)] border border-[var(--flux-primary-alpha-22)] bg-[var(--flux-surface-elevated)] p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
                        Previsibilidade
                      </p>
                      <p className="mt-1 text-[10px] text-[var(--flux-text-muted)]">Prazos sob controle</p>
                      <p className="mt-2 font-display text-3xl tabular-nums text-[var(--flux-text)]">
                        {portfolioSummary.avgPrevisibilidade ?? "—"}
                      </p>
                      <div className="mt-3">
                        <PortfolioMetricBar label="Média do portfólio" value={portfolioSummary.avgPrevisibilidade} />
                      </div>
                    </div>
                  </div>
                </section>

                <FluxCapabilityStrip />
              </>
            )}
            </>
          </DataFadeIn>
        )}
      </main>

      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-[var(--flux-z-modal-base)] flex items-center justify-center"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="bg-[var(--flux-surface-card)] border border-[var(--flux-primary-alpha-20)] rounded-[var(--flux-rad)] p-6 min-w-[320px] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display font-bold mb-4 text-[var(--flux-text)]">
              {modalMode === "new" ? t("modal.title.new") : t("modal.title.rename")}
            </h3>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-1 font-display">
                {t("modal.boardNameLabel")}
              </label>
              <input
                type="text"
                value={boardName}
                onChange={(e) => setBoardName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (modalMode === "new") createBoard();
                    else saveBoardName();
                  }
                }}
                placeholder={t("modal.boardNamePlaceholder")}
                className="w-full px-3 py-2 border border-[var(--flux-chrome-alpha-12)] rounded-[var(--flux-rad)] text-sm bg-[var(--flux-surface-elevated)] text-[var(--flux-text)] placeholder-[var(--flux-text-muted)] focus:border-[var(--flux-primary)] outline-none"
                autoFocus
              />
            </div>
            {modalMode === "new" ? (
              <div className="mb-4">
                <p className="block text-xs font-semibold text-[var(--flux-text-muted)] mb-2 font-display">
                  {t("modal.methodologyLabel")}
                </p>
                <div className="flex flex-wrap gap-0.5 rounded-lg border border-[var(--flux-chrome-alpha-12)] p-0.5 bg-[var(--flux-surface-elevated)]">
                  <button
                    type="button"
                    onClick={() => setCreateMethodology("scrum")}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      createMethodology === "scrum"
                        ? "bg-[var(--flux-primary-alpha-22)] text-[var(--flux-primary-light)]"
                        : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
                    }`}
                  >
                    {t("modal.methodologyScrum")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateMethodology("kanban")}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      createMethodology === "kanban"
                        ? "bg-[var(--flux-primary-alpha-22)] text-[var(--flux-primary-light)]"
                        : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
                    }`}
                  >
                    {t("modal.methodologyKanban")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateMethodology("lean_six_sigma")}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      createMethodology === "lean_six_sigma"
                        ? "bg-[var(--flux-primary-alpha-22)] text-[var(--flux-primary-light)]"
                        : "text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
                    }`}
                  >
                    {t("modal.methodologyLss")}
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-[var(--flux-text-muted)] leading-relaxed">{t("modal.methodologyHint")}</p>
              </div>
            ) : null}
            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => setModalOpen(false)}
                className="btn-secondary"
              >
                {t("modal.cancel")}
              </button>
              <button
                onClick={modalMode === "new" ? createBoard : saveBoardName}
                className="btn-primary"
              >
                {modalMode === "new" ? t("modal.create") : t("modal.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title={confirmDelete ? t("confirmDelete.title", { boardName: confirmDelete.name }) : ""}
        description={t("confirmDelete.description")}
        intent="danger"
        confirmText={t("confirmDelete.confirm")}
        cancelText={t("confirmDelete.cancel")}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          try {
            await apiDelete(`/api/boards/${confirmDelete.id}`, getHeaders());
            setConfirmDelete(null);
            loadBoards();
          } catch {
            pushToast({ kind: "error", title: t("confirmDelete.errorDelete") });
          }
        }}
      />
    </div>
  );
}
