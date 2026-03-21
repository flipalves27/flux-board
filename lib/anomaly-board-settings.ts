import type { AnomalyAlertPayload, AnomalyKind } from "./anomaly-detection";
import type { BoardData } from "./kv-boards";

export const ANOMALY_NOTIFY_KIND_OPTIONS = [
  "throughput_drop",
  "wip_explosion",
  "lead_time_spike",
  "stagnation_cluster",
  "okr_drift",
  "overdue_cascade",
  "cross_board_blocker_overdue",
] as const satisfies readonly AnomalyKind[];

export type AnomalyNotifyKind = (typeof ANOMALY_NOTIFY_KIND_OPTIONS)[number];

export type BoardAnomalyNotifications = {
  /** Default true when omitted. Set false to disable e-mail for this board's alerts. */
  emailEnabled?: boolean;
  /** Empty / omitted = all kinds. */
  notifyKinds?: AnomalyNotifyKind[];
  /** Minimum severity for e-mail (warning includes critical). */
  minSeverity?: "warning" | "critical";
  /** Extra recipients (validated on save). When empty, org admins receive mail. */
  recipientEmails?: string[];
};

const SEV_ORDER: Record<string, number> = { info: 0, warning: 1, critical: 2 };

export function severityMeetsEmailMin(severity: string, min: "warning" | "critical"): boolean {
  const s = SEV_ORDER[severity] ?? 0;
  const need = min === "critical" ? 2 : 1;
  return s >= need;
}

export function kindIncludedInBoardSettings(kind: string, cfg: BoardAnomalyNotifications | undefined): boolean {
  const list = cfg?.notifyKinds;
  if (!list || list.length === 0) return true;
  return (list as string[]).includes(kind);
}

/** E-mail gating for an alert, using the board that owns the signal (when any). */
export function boardEmailGate(
  alert: AnomalyAlertPayload,
  boardById: Map<string, BoardData>
): { send: boolean; board?: BoardData } {
  const bid = alert.boardId;
  if (!bid) {
    return { send: true };
  }
  const board = boardById.get(bid);
  const cfg = board?.anomalyNotifications;
  if (cfg?.emailEnabled === false) {
    return { send: false, board };
  }
  const min = cfg?.minSeverity ?? "warning";
  if (!severityMeetsEmailMin(alert.severity, min)) {
    return { send: false, board };
  }
  if (!kindIncludedInBoardSettings(alert.kind, cfg)) {
    return { send: false, board };
  }
  return { send: true, board };
}

export function buildAnomalyNotifyDedupeKey(alert: AnomalyAlertPayload): string {
  const bid = alert.boardId ?? "__org__";
  const kind = alert.kind;
  const d = alert.diagnostics || {};
  if (kind === "wip_explosion" && typeof d.columnKey === "string" && d.columnKey) {
    return `${bid}:${kind}:${d.columnKey}`;
  }
  if (kind === "okr_drift" && typeof d.keyResultId === "string" && d.keyResultId) {
    return `${bid}:${kind}:${d.keyResultId}`;
  }
  if (kind === "cross_board_blocker_overdue" && typeof d.blockerCardId === "string" && d.blockerCardId) {
    return `${bid}:${kind}:${d.blockerCardId}`;
  }
  return `${bid}:${kind}`;
}

export const ANOMALY_NOTIFY_DEDUPE_WINDOW_MS = 48 * 60 * 60 * 1000;
