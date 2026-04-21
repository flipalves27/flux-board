export const BOARD_ACTIVITY_ACTIONS = [
  "card.created",
  "card.moved",
  "card.updated",
  "card.deleted",
  "column.added",
  "column.removed",
  "board.settings_changed",
  "message.sent",
  "message.mentioned",
  "message.replied",
  "message.fluxy_interpreted",
  "message.fluxy_action_applied",
] as const;

export type BoardActivityAction = (typeof BOARD_ACTIVITY_ACTIONS)[number];

/** Shape used for diffing — aligned with BoardData fields that affect audit. */
export type BoardSnapshotForActivity = {
  id: string;
  name: string;
  cards?: unknown[];
  config?: { bucketOrder?: unknown[]; collapsedColumns?: string[]; labels?: unknown[] };
  portal?: unknown;
  mapaProducao?: unknown[];
  dailyInsights?: unknown[];
  anomalyNotifications?: unknown;
  intakeForm?: unknown;
  clientLabel?: string;
  version?: string;
};

export type BoardActivityDelta = {
  action: BoardActivityAction;
  target: string;
  details: Record<string, unknown> | null;
};

export type BoardActivityContext = {
  userId: string;
  userName: string;
  orgId: string;
};
