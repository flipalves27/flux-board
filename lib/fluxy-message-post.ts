import { getBoard } from "./kv-boards";
import { getUserById, listUsers } from "./kv-users";
import type { FluxyMessageData } from "./schemas";
import { scheduleFluxyMessageActivities } from "./fluxy-message-activity";
import { applyFluxyPolicyForMessage } from "./fluxy-message-policy";
import {
  notifyFluxyMessagePushRecipients,
  prioritizeAssigneeInTargets,
  resolveFluxyMentionsForOrg,
  type OrgMemberForMention,
} from "./fluxy-mention-routing";

function cardAssigneeFromBoard(board: { cards?: unknown[] } | null, cardId: string): string | null {
  const cards = Array.isArray(board?.cards) ? board.cards : [];
  for (const raw of cards) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as { id?: unknown; assigneeId?: unknown };
    if (String(c.id || "") !== cardId) continue;
    return typeof c.assigneeId === "string" && c.assigneeId.trim() ? c.assigneeId.trim() : null;
  }
  return null;
}

export async function prepareFluxyMessageMentions(input: {
  orgId: string;
  boardId: string;
  body: string;
  relatedCardId: string | null;
  clientMentions: FluxyMessageData["mentions"] | undefined;
}): Promise<{
  mentions: FluxyMessageData["mentions"];
  targetUserIds: string[];
  unresolvedTokens: string[];
}> {
  const board = await getBoard(input.boardId, input.orgId);
  const assigneeId =
    input.relatedCardId && board ? cardAssigneeFromBoard(board, input.relatedCardId) : null;
  const orgUsers: OrgMemberForMention[] = await listUsers(input.orgId);
  const resolved = resolveFluxyMentionsForOrg({
    body: input.body,
    orgUsers,
    clientMentions: input.clientMentions,
  });
  const targetUserIds = prioritizeAssigneeInTargets(resolved.targetUserIds, assigneeId);
  return {
    mentions: resolved.mentions,
    targetUserIds,
    unresolvedTokens: resolved.unresolvedTokens,
  };
}

export async function finalizeFluxyMessageSideEffects(input: {
  orgId: string;
  boardId: string;
  senderId: string;
  message: FluxyMessageData;
}): Promise<void> {
  const user = await getUserById(input.senderId, input.orgId);
  const senderLabel = (user?.name?.trim() || user?.username || "Alguém").slice(0, 200);
  const mentionRecipients = input.message.targetUserIds.filter((id) => id !== input.senderId);
  const effectiveCardId =
    (input.message.relatedCardId && input.message.relatedCardId.trim()) ||
    (input.message.contextCardId && input.message.contextCardId.trim()) ||
    null;

  if (mentionRecipients.length > 0) {
    await notifyFluxyMessagePushRecipients({
      orgId: input.orgId,
      boardId: input.boardId,
      cardId: effectiveCardId,
      senderId: input.senderId,
      senderLabel,
      targetUserIds: mentionRecipients,
      messagePreview: input.message.body,
    });
  }

  scheduleFluxyMessageActivities(
    {
      userId: input.senderId,
      userName: senderLabel,
      orgId: input.orgId,
      boardId: input.boardId,
    },
    {
      messageId: input.message.id,
      conversationScope: input.message.conversationScope,
      relatedCardId: effectiveCardId,
      preview: input.message.body,
      mediatedByFluxy: input.message.mediatedByFluxy,
      mentionUserIds: mentionRecipients,
    }
  );

  if (input.message.mediatedByFluxy) {
    await applyFluxyPolicyForMessage({
      orgId: input.orgId,
      boardId: input.boardId,
      relatedCardId: effectiveCardId,
      senderId: input.senderId,
      senderLabel,
      messageId: input.message.id,
      body: input.message.body,
      targetUserIds: input.message.targetUserIds,
    });
  }
}
