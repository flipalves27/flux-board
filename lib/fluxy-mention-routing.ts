import type { FluxyMessageData } from "./schemas";
import { enqueuePushOutbox, listPushSubscriptions } from "./kv-push-subscriptions";

export type FluxyMention = FluxyMessageData["mentions"][number];

export type OrgMemberForMention = {
  id: string;
  username: string;
  name: string;
  email: string;
};

const MENTION_SEGMENT =
  /@([\p{L}\p{N}][\p{L}\p{N}._-]*)/gu;
const MENTION_QUOTED = /@"([^"]{1,120})"/g;

function normKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Extracts @tokens from body (Unicode names, quoted @"full name").
 */
export function extractMentionTokensFromBody(body: string): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  const push = (raw: string) => {
    const t = raw.trim();
    if (!t || seen.has(normKey(t))) return;
    seen.add(normKey(t));
    order.push(t);
  };

  let m: RegExpExecArray | null;
  const q = new RegExp(MENTION_QUOTED.source, "g");
  while ((m = q.exec(body)) !== null) {
    push(m[1]);
  }
  const s = new RegExp(MENTION_SEGMENT.source, "gu");
  while ((m = s.exec(body)) !== null) {
    push(m[1]);
  }
  return order;
}

function buildMemberLookup(users: OrgMemberForMention[]): Map<string, OrgMemberForMention> {
  const m = new Map<string, OrgMemberForMention>();
  for (const u of users) {
    m.set(normKey(u.username), u);
    m.set(normKey(u.name), u);
    const local = u.email.includes("@") ? u.email.split("@")[0] : "";
    if (local) m.set(normKey(local), u);
    const first = u.name.split(/\s+/).filter(Boolean)[0];
    if (first) m.set(normKey(first), u);
  }
  return m;
}

function resolveTokenToMember(
  token: string,
  lookup: Map<string, OrgMemberForMention>,
  users: OrgMemberForMention[]
): OrgMemberForMention | null {
  const k = normKey(token);
  const direct = lookup.get(k);
  if (direct) return direct;

  const matches = users.filter(
    (u) =>
      normKey(u.name).includes(k) ||
      normKey(u.username).includes(k) ||
      normKey(u.email).includes(k)
  );
  if (matches.length === 1) return matches[0];
  return null;
}

type ClientMentionInput = Partial<FluxyMention> & { token?: string; userId?: string | null };

function memberIdsSet(users: OrgMemberForMention[]): Set<string> {
  return new Set(users.map((u) => u.id));
}

/**
 * Merges client-provided mentions with @text resolution against org members.
 * Assignee priority only affects `targetUserIds` order (see `prioritizeAssigneeInTargets`).
 */
export function resolveFluxyMentionsForOrg(input: {
  body: string;
  orgUsers: OrgMemberForMention[];
  clientMentions?: ClientMentionInput[] | null;
}): {
  mentions: FluxyMention[];
  targetUserIds: string[];
  unresolvedTokens: string[];
} {
  const users = input.orgUsers;
  const lookup = buildMemberLookup(users);
  const validIds = memberIdsSet(users);

  const byUserId = new Map<string, FluxyMention>();
  const unresolved = new Set<string>();

  const addMention = (token: string, userId: string | null, kind: FluxyMention["kind"]) => {
    if (!userId || !validIds.has(userId)) {
      unresolved.add(token);
      return;
    }
    const prev = byUserId.get(userId);
    if (prev && prev.kind === "implicit" && kind === "explicit") {
      byUserId.set(userId, { token, userId, kind: "explicit" });
      return;
    }
    if (!prev) byUserId.set(userId, { token, userId, kind });
  };

  for (const raw of input.clientMentions ?? []) {
    const token = String(raw.token ?? "").trim() || "?";
    const uid = raw.userId && validIds.has(raw.userId) ? raw.userId : null;
    if (uid) {
      addMention(token, uid, raw.kind === "implicit" ? "implicit" : "explicit");
      continue;
    }
    const resolved = resolveTokenToMember(token, lookup, users);
    if (resolved) addMention(token, resolved.id, "explicit");
    else unresolved.add(token);
  }

  for (const token of extractMentionTokensFromBody(input.body)) {
    const resolved = resolveTokenToMember(token, lookup, users);
    if (resolved) {
      if (!byUserId.has(resolved.id)) addMention(token, resolved.id, "explicit");
    } else {
      unresolved.add(token);
    }
  }

  const mentions = [...byUserId.values()];
  const targetUserIds = [...byUserId.keys()];
  return { mentions, targetUserIds, unresolvedTokens: [...unresolved] };
}

export function prioritizeAssigneeInTargets(targetUserIds: string[], assigneeId: string | null | undefined): string[] {
  const unique = [...new Set(targetUserIds)];
  if (!assigneeId?.trim()) return unique;
  const a = assigneeId.trim();
  if (!unique.includes(a)) return unique;
  return [a, ...unique.filter((id) => id !== a)];
}

export type FluxyPushDeepLinkOpts = {
  messageId: string;
  conversationScope: "board" | "card" | "direct";
  relatedCardId: string | null;
  contextCardId: string | null;
};

/**
 * Deep-link for web push: opens Fluxy, Sala or thread do card, e opcionalmente destaca a mensagem.
 * Usa `fluxyCtx` (não `card`) para contexto na sala do board sem abrir o modal do card.
 */
export function buildFluxyPushDeepLink(boardId: string, cardId: string | null, rich?: FluxyPushDeepLinkOpts | null): string {
  const params = new URLSearchParams();
  params.set("fluxyOpen", "1");
  if (rich?.messageId) params.set("fluxyMsg", rich.messageId);

  if (rich?.conversationScope === "card") {
    const cid = String(rich.relatedCardId || cardId || "").trim();
    if (cid) params.set("card", cid);
    params.set("fluxyCardThread", "1");
  } else if (rich?.conversationScope === "board") {
    params.set("fluxySala", "1");
    const ctx = String(rich.contextCardId || "").trim();
    if (ctx) params.set("fluxyCtx", ctx);
  } else if (cardId) {
    params.set("card", cardId);
  }

  const q = params.toString();
  return `/board/${encodeURIComponent(boardId)}?${q}`;
}

/**
 * Enqueues web push for each target user (excluding sender), respecting `mentions` subscription preference.
 */
export async function notifyFluxyMessagePushRecipients(input: {
  orgId: string;
  boardId: string;
  cardId: string | null;
  senderId: string;
  senderLabel: string;
  targetUserIds: string[];
  messagePreview: string;
  deepLink?: FluxyPushDeepLinkOpts | null;
}): Promise<void> {
  const preview = input.messagePreview.trim().slice(0, 120);
  const title =
    input.cardId != null
      ? `${input.senderLabel} mencionou você no card`
      : `${input.senderLabel} na Sala Fluxy`;
  const url = buildFluxyPushDeepLink(input.boardId, input.cardId, input.deepLink ?? null);
  const body = preview.length >= 120 ? `${preview.slice(0, 119)}…` : preview;

  for (const uid of input.targetUserIds) {
    if (uid === input.senderId) continue;
    const subs = await listPushSubscriptions(input.orgId, uid);
    for (const sub of subs) {
      if (sub.preferences.mentions === false) continue;
      await enqueuePushOutbox({
        orgId: input.orgId,
        userId: uid,
        endpoint: sub.endpoint,
        payload: { title, body, url },
        nextAttemptAt: new Date().toISOString(),
      });
    }
  }
}
