"use client";

import { create } from "zustand";
import type { PresencePeer } from "@/lib/board-realtime-hub";

export type CardLockInfo = { userId: string; userName: string };

type BoardCollabState = {
  presencePeers: PresencePeer[];
  cardLocks: Record<string, CardLockInfo>;
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
  reset: () => void;
};

export const useBoardCollabStore = create<BoardCollabState>((set) => ({
  presencePeers: [],
  cardLocks: {},
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
  reset: () =>
    set({
      presencePeers: [],
      cardLocks: {},
      sseConnected: false,
      pollingFallback: false,
      connectionId: null,
      clientId: null,
    }),
}));
