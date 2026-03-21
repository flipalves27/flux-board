"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { CustomTooltip } from "@/components/ui/custom-tooltip";
import { useBoardCollabStore } from "@/stores/board-collab-store";

const MAX_VISIBLE = 8;

function initials(name: string, username: string) {
  const s = (name || username || "?").trim();
  if (!s) return "?";
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
  return s.slice(0, 2).toUpperCase();
}

export function BoardPresenceAvatars() {
  const t = useTranslations("board.collab");
  const { user } = useAuth();
  const presencePeers = useBoardCollabStore((s) => s.presencePeers);
  const sseConnected = useBoardCollabStore((s) => s.sseConnected);
  const pollingFallback = useBoardCollabStore((s) => s.pollingFallback);

  const others = useMemo(
    () => presencePeers.filter((p) => p.userId !== user?.id),
    [presencePeers, user?.id]
  );

  if (others.length === 0 && !pollingFallback) {
    return null;
  }

  const shown = others.slice(0, MAX_VISIBLE);
  const extra = others.length - shown.length;

  return (
    <div
      className="flex items-center gap-1.5 shrink-0"
      aria-label={t("presenceAria")}
      title={pollingFallback ? t("pollingHint") : undefined}
    >
      {pollingFallback && (
        <span className="text-[10px] text-[var(--flux-text-muted)] tabular-nums mr-0.5" title={t("pollingHint")}>
          ↻
        </span>
      )}
      <div className="flex -space-x-2">
        {extra > 0 && (
          <span
            className="relative z-0 inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--flux-surface-mid)] bg-[var(--flux-surface-elevated)] text-[10px] font-bold text-[var(--flux-text-muted)]"
            title={`+${extra}`}
          >
            +{extra}
          </span>
        )}
        {shown.map((p) => {
          const label = p.displayName || p.username;
          const tip = p.columnKey ? t("peerTooltipWithColumn", { name: label, column: p.columnKey }) : label;
          return (
            <CustomTooltip key={p.connectionId} content={tip} position="bottom">
              <span
                className="relative z-[1] inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--flux-surface-mid)] bg-gradient-to-br from-[var(--flux-primary-alpha-35)] to-[var(--flux-secondary-alpha-25)] text-[11px] font-bold text-white shadow-sm"
                aria-hidden
              >
                {initials(p.displayName, p.username)}
              </span>
            </CustomTooltip>
          );
        })}
      </div>
      {sseConnected && others.length > 0 && (
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--flux-success)] shrink-0" title={t("live")} aria-hidden />
      )}
    </div>
  );
}
