import { getBoard, updateBoardFromExisting, type BoardData } from "./kv-boards";
import { scheduleFluxyActionAppliedActivity, scheduleFluxyInterpretedActivity } from "./fluxy-message-activity";
import {
  classifyFluxyIntent,
  parseDelayDaysFromText,
  stripConfirmApplyPrefix,
} from "./fluxy-message-intent";

type PolicyContext = {
  orgId: string;
  boardId: string;
  relatedCardId: string | null;
  senderId: string;
  senderLabel: string;
  messageId: string;
  body: string;
  targetUserIds: string[];
};

function withBlockedMarker(board: BoardData, cardId: string, marker: string): BoardData["cards"] | null {
  const cards = Array.isArray(board.cards) ? board.cards : [];
  let changed = false;
  const next = cards.map((raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const c = raw as unknown as Record<string, unknown>;
    if (String(c.id || "") !== cardId) return raw;
    const blockedBy = Array.isArray(c.blockedBy)
      ? c.blockedBy.map((v) => String(v || "").trim()).filter(Boolean)
      : [];
    if (!blockedBy.includes(marker)) blockedBy.push(marker);
    changed = true;
    return {
      ...c,
      blockedBy,
      progress: typeof c.progress === "string" && c.progress.trim() ? c.progress : "Bloqueado",
    };
  });
  return changed ? (next as BoardData["cards"]) : null;
}

function withShiftedDueDate(board: BoardData, cardId: string, days: number): BoardData["cards"] | null {
  const cards = Array.isArray(board.cards) ? board.cards : [];
  let changed = false;
  const next = cards.map((raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const c = raw as unknown as Record<string, unknown>;
    if (String(c.id || "") !== cardId) return raw;
    const rawDue = c.dueDate != null && String(c.dueDate).trim() ? String(c.dueDate) : null;
    const base = rawDue ? new Date(rawDue) : new Date();
    if (!Number.isFinite(base.getTime())) return raw;
    base.setDate(base.getDate() + days);
    const ymd = base.toISOString().slice(0, 10);
    changed = true;
    return { ...c, dueDate: ymd };
  });
  return changed ? (next as BoardData["cards"]) : null;
}

function withAssignee(board: BoardData, cardId: string, assigneeId: string): BoardData["cards"] | null {
  const cards = Array.isArray(board.cards) ? board.cards : [];
  let changed = false;
  const next = cards.map((raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const c = raw as unknown as Record<string, unknown>;
    if (String(c.id || "") !== cardId) return raw;
    changed = true;
    return { ...c, assigneeId };
  });
  return changed ? (next as BoardData["cards"]) : null;
}

export async function applyFluxyPolicyForMessage(input: PolicyContext): Promise<void> {
  if (!input.relatedCardId) return;

  const { intent, decision, detail, forcedConfirm } = classifyFluxyIntent(input.body);
  const { rest } = stripConfirmApplyPrefix(input.body);
  const activityCtx = {
    userId: input.senderId,
    userName: input.senderLabel,
    orgId: input.orgId,
    boardId: input.boardId,
  };

  scheduleFluxyInterpretedActivity(activityCtx, {
    messageId: input.messageId,
    relatedCardId: input.relatedCardId,
    summary: detail.summary,
    intent: intent === "none" ? null : intent,
    policyDecision: decision,
    riskLevel: detail.risk,
  });

  if (decision !== "auto_applied") return;

  const board = await getBoard(input.boardId, input.orgId);
  if (!board) return;

  const persist = async (nextCards: BoardData["cards"]) => {
    await updateBoardFromExisting(board, { cards: nextCards }, {
      userId: input.senderId,
      userName: input.senderLabel,
      orgId: input.orgId,
    });
  };

  if (intent === "mark_blocked") {
    const marker = `fluxy:auto-block:${input.messageId}`;
    const nextCards = withBlockedMarker(board, input.relatedCardId, marker);
    if (!nextCards) return;
    await persist(nextCards);
    scheduleFluxyActionAppliedActivity(activityCtx, {
      messageId: input.messageId,
      cardId: input.relatedCardId,
      action: "mark_blocked_auto_applied",
      details: {
        policyDecision: decision,
        riskLevel: detail.risk,
        reason: detail.reason,
        marker,
      },
    });
    return;
  }

  if (intent === "shift_due_date") {
    const days = parseDelayDaysFromText(forcedConfirm ? rest : input.body);
    if (!days) return;
    const nextCards = withShiftedDueDate(board, input.relatedCardId, days);
    if (!nextCards) return;
    await persist(nextCards);
    scheduleFluxyActionAppliedActivity(activityCtx, {
      messageId: input.messageId,
      cardId: input.relatedCardId,
      action: "due_date_shift_applied",
      details: {
        policyDecision: decision,
        riskLevel: detail.risk,
        days,
        forcedConfirm,
      },
    });
    return;
  }

  if (intent === "reassign") {
    const uid = input.targetUserIds.find((id) => id && id.trim());
    if (!uid) return;
    const nextCards = withAssignee(board, input.relatedCardId, uid);
    if (!nextCards) return;
    await persist(nextCards);
    scheduleFluxyActionAppliedActivity(activityCtx, {
      messageId: input.messageId,
      cardId: input.relatedCardId,
      action: "reassign_applied",
      details: {
        policyDecision: decision,
        riskLevel: detail.risk,
        assigneeId: uid,
        forcedConfirm,
      },
    });
  }
}
