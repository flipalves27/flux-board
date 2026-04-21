"use client";

import { useMemo } from "react";
import { useBoardCollabStore } from "@/stores/board-collab-store";
import { useAuth } from "@/context/auth-context";

const CURSOR_COLORS = [
  "var(--flux-collab-cursor-0)",
  "var(--flux-collab-cursor-1)",
  "var(--flux-collab-cursor-2)",
  "var(--flux-collab-cursor-3)",
  "var(--flux-collab-cursor-4)",
  "var(--flux-collab-cursor-5)",
  "var(--flux-collab-cursor-6)",
  "var(--flux-collab-cursor-7)",
  "var(--flux-collab-cursor-8)",
  "var(--flux-collab-cursor-9)",
];

function hashToColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length] ?? CURSOR_COLORS[0]!;
}

export function CollaborationCursors() {
  const { user } = useAuth();
  const presencePeers = useBoardCollabStore((s) => s.presencePeers);

  const otherPeers = useMemo(() => {
    if (!user) return [];
    return presencePeers
      .filter((p) => p.userId !== user.id)
      .slice(0, 10);
  }, [presencePeers, user]);

  if (otherPeers.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-30 flex flex-col items-end gap-1">
      {otherPeers.map((peer) => {
        const color = hashToColor(peer.userId);
        return (
          <div
            key={peer.userId}
            className="pointer-events-auto flex items-center gap-2 rounded-full border border-[var(--flux-chrome-alpha-12)] bg-[var(--flux-surface-card)]/95 px-3 py-1.5 shadow-md backdrop-blur-sm"
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="text-xs font-medium text-[var(--flux-text)]">
              {peer.displayName || peer.username || "Usuário"}
            </span>
            {peer.columnKey && (
              <span className="text-[10px] text-[var(--flux-text-muted)]">
                em {peer.columnKey}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
