"use client";

import { useCallback, useEffect, useState } from "react";
import { useShallow } from "zustand/shallow";
import { useBoardStore } from "@/stores/board-store";
import { generateProactiveNudges, type ProactiveNudge } from "@/lib/copilot-proactive-engine";

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
  const db = useBoardStore(useShallow((s) => s.db));
  const [nudges, setNudges] = useState<ProactiveNudge[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    if (!db || !db.cards) return;
    const cards = Array.isArray(db.cards) ? db.cards : [];
    const bucketOrder = db.config?.bucketOrder ?? [];
    const columns = bucketOrder.map((c) => ({
      key: String(c.key || c.label || ""),
      label: String(c.label || c.key || ""),
      wipLimit: c.wipLimit,
    }));

    const cardData = cards.map((c) => ({
      id: c.id,
      title: c.title,
      desc: c.desc || undefined,
      bucket: c.bucket,
      progress: c.progress,
      columnEnteredAt: c.columnEnteredAt,
      dueDate: c.dueDate ?? null,
      blockedBy: c.blockedBy,
      assignee: undefined as string | undefined,
    }));

    const result = generateProactiveNudges(cardData, columns, { maxNudges: 6 });
    setNudges(result);
  }, [db]);

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
  }, []);

  const visible = nudges.filter((n) => !dismissed.has(n.id));
  if (visible.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 z-30 max-w-sm">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="mb-2 flex items-center gap-2 rounded-full border border-[var(--flux-primary-alpha-30)] bg-[var(--flux-surface-card)] px-3 py-1.5 text-xs font-semibold text-[var(--flux-text)] shadow-lg backdrop-blur-sm"
      >
        <svg className="h-3.5 w-3.5 text-[var(--flux-primary)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
        Copilot ({visible.length})
        <svg className={`h-3 w-3 transition-transform ${collapsed ? "" : "rotate-180"}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {!collapsed && (
        <div className="space-y-2">
          {visible.map((nudge) => (
            <div
              key={nudge.id}
              className={`flex items-start gap-2 rounded-xl border p-3 shadow-md backdrop-blur-sm ${SEVERITY_STYLES[nudge.severity]}`}
            >
              <svg className={`mt-0.5 h-4 w-4 shrink-0 ${SEVERITY_ICON_COLOR[nudge.severity]}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <p className="min-w-0 flex-1 text-xs leading-relaxed text-[var(--flux-text)]">
                {nudge.message}
              </p>
              {nudge.dismissible && (
                <button
                  type="button"
                  onClick={() => dismiss(nudge.id)}
                  className="shrink-0 text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
                  aria-label="Dispensar"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
