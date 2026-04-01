"use client";

import { create } from "zustand";
import type { PresencePeer } from "@/lib/board-realtime-hub";
import type { DragMoveSsePayload } from "@/lib/board-realtime-envelope";

export type CardLockInfo = { userId: string; userName: string };

/** Arrasto remoto (outro utilizador) — atualizado por SSE drag_*; expira sem drag_move. */
export type RemoteDragState = {
  displayName: string;
  cardIds: string[];
  overKind: DragMoveSsePayload["overKind"] | null;
  bucketKey?: string;
  slotIndex?: number;
  overCardId?: string;
  lastMoveAt: number;
};

type BoardCollabState = {
  presencePeers: PresencePeer[];
  cardLocks: Record<string, CardLockInfo>;
  /** Por userId — posição aproximada do arrasto remoto (UX, não estado persistido). */
  remoteDragByUser: Record<string, RemoteDragState>;
  sseConnected: boolean;
  /** Sem SSE: polling periódico do board ativo. */
  pollingFallback: boolean;
  /** Conexão SSE ativa — necessário para lock/move via POST. */
  connectionId: string | null;
  clientId: string | null;
  setPresence: (peers: PresencePeer[]) => void;
  setSseConnected: (v: boolean) => void;
  setPollingFallback: (v: boolean) => void;
  setConnectionMeta: (connectionId: string | null, clientId: string | null) => void;
  setLocksFromServer: (locks: Record<string, CardLockInfo>) => void;
  applyLockEvent: (cardId: string, locked: boolean, info?: CardLockInfo) => void;
  applyRemoteDragStart: (userId: string, displayName: string, cardIds: string[]) => void;
  applyRemoteDragMove: (userId: string, payload: DragMoveSsePayload) => void;
  applyRemoteDragEnd: (userId: string) => void;
  pruneStaleRemoteDrags: (maxIdleMs: number) => void;
  reset: () => void;
};

export const useBoardCollabStore = create<BoardCollabState>((set) => ({
  presencePeers: [],
  cardLocks: {},
  remoteDragByUser: {},
  sseConnected: false,
  pollingFallback: false,
  connectionId: null,
  clientId: null,
  setPresence: (peers) => set({ presencePeers: peers }),
  setSseConnected: (v) => set({ sseConnected: v }),
  setPollingFallback: (v) => set({ pollingFallback: v }),
  setConnectionMeta: (connectionId, clientId) => set({ connectionId, clientId }),
  setLocksFromServer: (locks) => set({ cardLocks: locks }),
  applyLockEvent: (cardId, locked, info) =>
    set((s) => {
      const next = { ...s.cardLocks };
      if (!locked) {
        delete next[cardId];
      } else if (info) {
        next[cardId] = info;
      }
      return { cardLocks: next };
    }),
  applyRemoteDragStart: (userId, displayName, cardIds) =>
    set((s) => {
      const now = Date.now();
      const next = { ...s.remoteDragByUser };
      next[userId] = {
        displayName,
        cardIds,
        overKind: null,
        lastMoveAt: now,
      };
      return { remoteDragByUser: next };
    }),
  applyRemoteDragMove: (userId, payload) =>
    set((s) => {
      const prev = s.remoteDragByUser[userId];
      const peer = s.presencePeers.find((p) => p.userId === userId);
      const displayName =
        prev?.displayName ||
        peer?.displayName?.trim() ||
        peer?.username?.trim() ||
        "";
      const now = Date.now();
      const next = { ...s.remoteDragByUser };
      next[userId] = {
        displayName,
        cardIds: prev?.cardIds ?? [],
        overKind: payload.overKind,
        bucketKey: payload.bucketKey,
        slotIndex: payload.slotIndex,
        overCardId: payload.overCardId,
        lastMoveAt: now,
      };
      return { remoteDragByUser: next };
    }),
  applyRemoteDragEnd: (userId) =>
    set((s) => {
      if (!s.remoteDragByUser[userId]) return s;
      const next = { ...s.remoteDragByUser };
      delete next[userId];
      return { remoteDragByUser: next };
    }),
  pruneStaleRemoteDrags: (maxIdleMs) =>
    set((s) => {
      const now = Date.now();
      let changed = false;
      const next = { ...s.remoteDragByUser };
      for (const [uid, st] of Object.entries(next)) {
        if (now - st.lastMoveAt > maxIdleMs) {
          delete next[uid];
          changed = true;
        }
      }
      return changed ? { remoteDragByUser: next } : s;
    }),
  reset: () =>
    set({
      presencePeers: [],
      cardLocks: {},
      remoteDragByUser: {},
      sseConnected: false,
      pollingFallback: false,
      connectionId: null,
      clientId: null,
    }),
}));
