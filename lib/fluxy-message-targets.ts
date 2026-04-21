import type { FluxyMessageData } from "@/lib/schemas";
import type { Organization } from "@/lib/kv-organizations";
import { getBoard } from "@/lib/kv-boards";
import { listUsers } from "@/lib/kv-users";
import type { OrgMemberForMention } from "@/lib/fluxy-mention-routing";
import {
  prioritizeAssigneeInTargets,
  resolveFluxyMentionsForOrg,
} from "@/lib/fluxy-mention-routing";
import {
  interpretFluxyCommandWithLlm,
  shouldRunFluxyCommandLlm,
  type FluxyCommandInterpretation,
} from "@/lib/fluxy-command-llm";

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

const MAX_NOTIFY_RECIPIENTS = 50;
const CONFIRM_RECIPIENT_THRESHOLD = 5;

export type FluxyNotifyPreview = {
  targetUserIds: string[];
  displayNames: string[];
  idsAddedByInference: string[];
};

export type BuildFluxyMessageTargetsResult = {
  mentions: FluxyMessageData["mentions"];
  targetUserIds: string[];
  unresolvedTokens: string[];
  interpretation: FluxyCommandInterpretation | null;
  interpretationSource: "llm" | "heuristic" | null;
  needsNotifyConfirmation: boolean;
  notifyPreview: FluxyNotifyPreview | null;
};

function displayNameForUser(users: OrgMemberForMention[], id: string): string {
  const u = users.find((x) => x.id === id);
  return (u?.name?.trim() || u?.username || id).slice(0, 120);
}

function mergeImplicitMentions(
  baseMentions: FluxyMessageData["mentions"],
  extraUserIds: string[],
  users: OrgMemberForMention[]
): FluxyMessageData["mentions"] {
  const valid = new Set(users.map((u) => u.id));
  const byUser = new Map<string, FluxyMessageData["mentions"][number]>();
  for (const m of baseMentions) {
    if (m.userId && valid.has(m.userId)) byUser.set(m.userId, m);
  }
  for (const id of extraUserIds) {
    if (!valid.has(id) || byUser.has(id)) continue;
    const label = displayNameForUser(users, id);
    byUser.set(id, { token: label.slice(0, 80), userId: id, kind: "implicit" });
  }
  return [...byUser.values()];
}

/**
 * Resolve @menções, interpretação LLM (mediatedByFluxy) e merge de destinatários com dedupe.
 */
export async function buildFluxyMessageTargets(input: {
  org: Organization | null;
  orgId: string;
  userId: string;
  isAdmin: boolean;
  boardId: string;
  body: string;
  relatedCardId: string | null;
  contextCardId: string | null;
  clientMentions: FluxyMessageData["mentions"] | undefined;
  mediatedByFluxy: boolean;
  confirmFluxyNotify: boolean;
}): Promise<BuildFluxyMessageTargetsResult> {
  const effectiveCardId =
    (input.relatedCardId && input.relatedCardId.trim()) || (input.contextCardId && input.contextCardId.trim()) || null;

  const board = await getBoard(input.boardId, input.orgId);
  const assigneeId = effectiveCardId && board ? cardAssigneeFromBoard(board, effectiveCardId) : null;

  const orgUsers = await listUsers(input.orgId);

  const mentionResolved = resolveFluxyMentionsForOrg({
    body: input.body,
    orgUsers,
    clientMentions: input.clientMentions,
  });
  const mentionTargetsOrdered = prioritizeAssigneeInTargets(mentionResolved.targetUserIds, assigneeId);
  const mentionSet = new Set(mentionTargetsOrdered);

  let interpretation: FluxyCommandInterpretation | null = null;
  let interpretationSource: "llm" | "heuristic" | null = null;
  let llmExtraIds: string[] = [];

  if (shouldRunFluxyCommandLlm(input.mediatedByFluxy, input.body)) {
    const llm = await interpretFluxyCommandWithLlm({
      org: input.org,
      orgId: input.orgId,
      userId: input.userId,
      isAdmin: input.isAdmin,
      body: input.body,
      boardId: input.boardId,
      contextCardId: effectiveCardId,
      orgUsers,
      assigneeId,
    });
    if (llm.ok) {
      interpretation = llm.data;
      interpretationSource = llm.source;
      const fromLlm = llm.data.notifyUserIds.filter((id) => !mentionSet.has(id));
      llmExtraIds = fromLlm;

      if (llm.data.intent === "notify_assignee" && assigneeId && !mentionSet.has(assigneeId) && orgUsers.some((u) => u.id === assigneeId)) {
        if (!llmExtraIds.includes(assigneeId)) llmExtraIds.push(assigneeId);
      }
    }
  }

  const mergedIds = [...new Set([...mentionTargetsOrdered, ...llmExtraIds])].filter((id) => orgUsers.some((u) => u.id === id));
  const capped = mergedIds.slice(0, MAX_NOTIFY_RECIPIENTS);
  const mentions = mergeImplicitMentions(mentionResolved.mentions, llmExtraIds, orgUsers);

  const targetUserIds = prioritizeAssigneeInTargets(capped, assigneeId);

  const idsAddedByInference = targetUserIds.filter((id) => !mentionSet.has(id));
  const needsNotifyConfirmation =
    input.mediatedByFluxy &&
    !input.confirmFluxyNotify &&
    targetUserIds.length > 0 &&
    (idsAddedByInference.length > 0 || targetUserIds.length > CONFIRM_RECIPIENT_THRESHOLD);

  const notifyPreview: FluxyNotifyPreview | null = needsNotifyConfirmation
    ? {
        targetUserIds,
        displayNames: targetUserIds.map((id) => displayNameForUser(orgUsers, id)),
        idsAddedByInference,
      }
    : null;

  return {
    mentions,
    targetUserIds,
    unresolvedTokens: mentionResolved.unresolvedTokens,
    interpretation,
    interpretationSource,
    needsNotifyConfirmation,
    notifyPreview,
  };
}
