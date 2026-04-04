"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useShallow } from "zustand/shallow";
import { useBoardStore } from "@/stores/board-store";
import type { ProactiveNudge } from "@/lib/copilot-proactive-engine";
import type { BoardData } from "@/lib/kv-boards";
import { buildWipCoachPackage, type WipCoachAction } from "@/lib/wip-coach-suggestions";

type CopilotNudgeToastProps = {
  boardId: string;
};

const SEVERITY_STYLES: Record<ProactiveNudge["severity"], string> = {
  critical: "border-[var(--flux-danger)]/40 bg-[var(--flux-danger)]/8",
  warning: "border-[var(--flux-warning)]/40 bg-[var(--flux-warning)]/8",
  info: "border-[var(--flux-info)]/40 bg-[var(--flux-info)]/8",
};

const SEVERITY_ICON_COLOR: Record<ProactiveNudge["severity"], string> = {
  critical: "text-[var(--flux-danger)]",
  warning: "text-[var(--flux-warning)]",
  info: "text-[var(--flux-info)]",
};

export function CopilotNudgeToast({ boardId }: CopilotNudgeToastProps) {
  const t = useTranslations("board.copilotNudges");
  const db = useBoardStore(useShallow((s) => s.db));
  const [nudges, setNudges] = useState<ProactiveNudge[]>([]);
  const [coachActions, setCoachActions] = useState<WipCoachAction[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    setDismissed(new Set());
    setCollapsed(true);
  }, [boardId]);

  useEffect(() => {
    if (!db || !db.cards) return;
    const cards = Array.isArray(db.cards) ? db.cards : [];
    const bucketOrder = db.config?.bucketOrder ?? [];
    const columns = bucketOrder.map((c) => ({
      key: String(c.key || c.label || ""),
      label: String(c.label || c.key || ""),
      wipLimit: c.wipLimit,
    }));

    const pack = buildWipCoachPackage(db as BoardData, columns);
    setNudges(pack.nudges.slice(0, 6));
    setCoachActions(pack.actions.slice(0, 5));
  }, [db]);

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
  }, []);

  const visible = nudges.filter((n) => !dismissed.has(n.id));
  if (visible.length === 0) return null;

  return (
    <div
      data-tour="board-nudge-toast"
      className="pointer-events-none fixed z-[var(--flux-z-app-routine-toasts)] flex max-w-sm flex-col items-end max-md:left-auto max-md:right-4 max-md:bottom-[calc(max(1rem,env(safe-area-inset-bottom,0px))+4.5rem)] md:bottom-6 md:left-auto md:right-56"
    >
      <div className="pointer-events-auto w-full max-w-sm">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? t("expand") : t("collapse")}
          className="flux-glass-surface flux-motion-standard mb-2 inline-flex max-w-full items-center gap-2 self-end rounded-full px-3 py-1.5 text-xs font-semibold text-[var(--flux-text)]"
        >
          <svg className="h-3.5 w-3.5 shrink-0 text-[var(--flux-primary)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          <span className="min-w-0 truncate">{t("toggleLabel", { count: visible.length })}</span>
          <svg className={`h-3 w-3 shrink-0 transition-transform ${collapsed ? "" : "rotate-180"}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {!collapsed && (
          <div className="space-y-2">
            {visible.map((nudge) => (
              <div
                key={nudge.id}
                className={`flux-glass-surface flux-motion-standard flex items-start gap-2 rounded-xl p-3 ${SEVERITY_STYLES[nudge.severity]}`}
              >
                <svg className={`mt-0.5 h-4 w-4 shrink-0 ${SEVERITY_ICON_COLOR[nudge.severity]}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                <p className="min-w-0 flex-1 text-xs leading-relaxed text-[var(--flux-text)]">{nudge.message}</p>
                {nudge.dismissible && (
                  <button
                    type="button"
                    onClick={() => dismiss(nudge.id)}
                    className="shrink-0 text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
                    aria-label={t("dismiss")}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
            {coachActions.length > 0 ? (
              <div className="flux-glass-surface rounded-xl border-[var(--flux-secondary-alpha-28)] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-primary-light)]">{t("coachTitle")}</p>
                <p className="mt-0.5 text-[10px] text-[var(--flux-text-muted)]">{t("coachSubtitle")}</p>
                <ul className="mt-2 space-y-2">
                  {coachActions.map((a) => (
                    <li key={a.id} className="text-xs leading-snug text-[var(--flux-text)]">
                      <span className="font-semibold text-[var(--flux-text)]">{a.title}</span>
                      <span className="mt-0.5 block text-[11px] text-[var(--flux-text-muted)]">{a.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
