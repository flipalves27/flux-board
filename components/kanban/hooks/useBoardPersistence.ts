import { useEffect, useState } from "react";
import { BOARD_VIEW_STORAGE_PREFIX, KANBAN_FILTERS_STORAGE_PREFIX } from "../kanban-constants";

export type SavedKanbanFilters = {
  activePrio: string;
  activeLabels: string[];
  searchQuery: string;
};

export function useBoardPersistence(boardId: string) {
  const filtersStorageKey = `${KANBAN_FILTERS_STORAGE_PREFIX}${boardId}`;
  const viewStorageKey = `${BOARD_VIEW_STORAGE_PREFIX}${boardId}`;

  const [boardView, setBoardView] = useState<"kanban" | "timeline">("kanban");
  const [activePrio, setActivePrio] = useState("all");
  const [activeLabels, setActiveLabels] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const v = window.localStorage.getItem(viewStorageKey);
      if (v === "timeline" || v === "kanban") setBoardView(v);
    } catch {
      // ignore
    }
  }, [viewStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(viewStorageKey, boardView);
    } catch {
      // ignore
    }
  }, [boardView, viewStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(filtersStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SavedKanbanFilters;
      if (typeof parsed.activePrio === "string") setActivePrio(parsed.activePrio);
      if (Array.isArray(parsed.activeLabels)) {
        setActiveLabels(new Set(parsed.activeLabels.filter((item) => typeof item === "string")));
      }
      if (typeof parsed.searchQuery === "string") setSearchQuery(parsed.searchQuery);
    } catch {
      // ignore storage parsing errors
    }
  }, [filtersStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const payload: SavedKanbanFilters = {
      activePrio,
      activeLabels: [...activeLabels],
      searchQuery,
    };
    window.localStorage.setItem(filtersStorageKey, JSON.stringify(payload));
  }, [activePrio, activeLabels, searchQuery, filtersStorageKey]);

  return {
    boardView,
    setBoardView,
    activePrio,
    setActivePrio,
    activeLabels,
    setActiveLabels,
    searchQuery,
    setSearchQuery,
    filtersStorageKey,
    viewStorageKey,
  };
}
