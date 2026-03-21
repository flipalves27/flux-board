import { updateBoardFromExisting, type BoardData } from "./kv-boards";
import type { AutomationRule } from "./automation-types";
import { getBoardAutomationRules } from "./kv-automations";
import { getUserById } from "./kv-users";
import { classifyCardWithTogether, generateExecutiveBriefTogether } from "./automation-ai";
import { sendAutomationEmail } from "./automation-email";

export function normalizeTag(s: string): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function tagList(card: Record<string, unknown>): string[] {
  return Array.isArray(card.tags) ? card.tags.map((x) => String(x)) : [];
}

function bucketKeysExist(board: BoardData, key: string): boolean {
  const order = board.config?.bucketOrder;
  if (!Array.isArray(order)) return false;
  return order.some((b) => String((b as { key?: string })?.key || "") === key);
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function enrichCardsColumnTimestamps(prevCards: unknown[] | undefined, nextCards: unknown[]): unknown[] {
  const prevById = new Map((prevCards || []).map((c) => [String((c as { id?: string })?.id), c]));
  const isoNow = new Date().toISOString();
  const nowMs = Date.now();
  return nextCards.map((raw) => {
    const c = raw as Record<string, unknown>;
    const id = String(c?.id || "");
    const prev = prevById.get(id) as Record<string, unknown> | undefined;
    const nextBucket = String(c.bucket || "");
    const nextProgress = String(c.progress || "");
    const prevProgress = prev ? String(prev.progress || "") : "";

    let completedAt: string | undefined = typeof c.completedAt === "string" ? c.completedAt : undefined;
    let completedCycleDays: number | undefined =
      typeof c.completedCycleDays === "number" && Number.isFinite(c.completedCycleDays)
        ? Math.max(0, Math.floor(c.completedCycleDays))
        : undefined;

    const reopening = prev && prevProgress === "Concluída" && nextProgress !== "Concluída";
    const completing = prev && prevProgress !== "Concluída" && nextProgress === "Concluída";

    if (reopening) {
      completedAt = undefined;
      completedCycleDays = undefined;
    }

    if (completing && prev) {
      const enteredRaw = typeof prev.columnEnteredAt === "string" ? prev.columnEnteredAt : null;
      const createdRaw = typeof prev.createdAt === "string" ? prev.createdAt : null;
      const startMs = enteredRaw
        ? new Date(enteredRaw).getTime()
        : createdRaw
          ? new Date(createdRaw).getTime()
          : nowMs;
      const ok = !Number.isNaN(startMs);
      completedAt = isoNow;
      completedCycleDays = ok ? Math.max(0, Math.floor((nowMs - startMs) / DAY_MS)) : undefined;
    }

    if (!prev) {
      return { ...c, columnEnteredAt: c.columnEnteredAt || isoNow, completedAt, completedCycleDays };
    }
    const prevBucket = String(prev.bucket || "");
    if (prevBucket !== nextBucket) {
      const { automationState: _a, ...rest } = c;
      return { ...rest, bucket: nextBucket, columnEnteredAt: isoNow, completedAt, completedCycleDays };
    }
    return { ...c, columnEnteredAt: c.columnEnteredAt || prev.columnEnteredAt || isoNow, completedAt, completedCycleDays };
  });
}

function daysUntilDue(dueDate: string | null | undefined): number | null {
  if (!dueDate || typeof dueDate !== "string") return null;
  const due = new Date(`${dueDate.trim()}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 86400000);
}

function isSameUtcDay(aIso: string, bIso: string): boolean {
  const a = new Date(aIso);
  const b = new Date(bIso);
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export function computeBoardCompletionPercent(cards: unknown[]): number {
  if (!cards.length) return 0;
  let done = 0;
  for (const raw of cards) {
    const c = raw as { progress?: string };
    if (String(c?.progress || "") === "Concluída") done++;
  }
  return Math.round((done / cards.length) * 100);
}

function findMovedToColumnIds(prevCards: unknown[], nextCards: unknown[], columnKey: string): string[] {
  const prevById = new Map(prevCards.map((c) => [String((c as { id?: string })?.id), c]));
  const ids: string[] = [];
  for (const n of nextCards) {
    const c = n as { id?: string; bucket?: string };
    const id = String(c?.id || "");
    const p = prevById.get(id) as { bucket?: string } | undefined;
    const nb = String(c?.bucket || "");
    const pb = p ? String(p.bucket || "") : "";
    if (p && pb !== nb && nb === columnKey) ids.push(id);
  }
  return ids;
}

function findNewCardIdsWithTag(prevCards: unknown[], nextCards: unknown[], tag: string): string[] {
  const prevIds = new Set(prevCards.map((c) => String((c as { id?: string })?.id)));
  const want = normalizeTag(tag);
  const ids: string[] = [];
  for (const n of nextCards) {
    const c = n as { id?: string; tags?: string[] };
    const id = String(c?.id || "");
    if (prevIds.has(id)) continue;
    const tags = Array.isArray(c.tags) ? c.tags : [];
    if (tags.some((t) => normalizeTag(String(t)) === want)) ids.push(id);
  }
  return ids;
}

function buildCardsSummary(cards: unknown[]): string {
  const lines: string[] = [];
  for (const raw of cards.slice(0, 80)) {
    const c = raw as { id?: string; title?: string; bucket?: string; priority?: string; progress?: string; dueDate?: string | null };
    lines.push(
      `- ${String(c.id)} | ${String(c.title || "").slice(0, 120)} | ${String(c.bucket)} | ${String(c.priority)} | ${String(c.progress)} | due:${c.dueDate ?? ""}`
    );
  }
  return lines.join("\n");
}

async function applyActionToCard(ctx: {
  card: Record<string, unknown>;
  rule: AutomationRule;
  boardName: string;
  boardId: string;
  ownerEmail: string;
  orgId: string;
  board?: BoardData;
}): Promise<Record<string, unknown>> {
  const { card, rule } = ctx;
  const a = rule.action;

  const notify = (subject: string, text: string) => {
    if (!ctx.ownerEmail) return;
    void sendAutomationEmail({ to: ctx.ownerEmail, subject, text });
  };

  switch (a.type) {
    case "set_priority":
      return { ...card, priority: a.priority };
    case "set_progress":
      return { ...card, progress: a.progress };
    case "set_priority_and_notify_owner": {
      notify(
        `[Flux] ${ctx.boardName} — automação`,
        `Card "${String(card.title)}" (${String(card.id)}): prioridade definida como ${a.priority}.\nRegra: ${rule.name || rule.id}`
      );
      return { ...card, priority: a.priority };
    }
    case "notify_owner_add_tag": {
      const merged = new Set([...tagList(card), a.tag].map((x) => String(x).trim()).filter(Boolean));
      notify(
        `[Flux] ${ctx.boardName} — automação`,
        `Card "${String(card.title)}" (${String(card.id)}): tag "${a.tag}" aplicada.\nRegra: ${rule.name || rule.id}`
      );
      return { ...card, tags: [...merged] };
    }
    case "send_due_reminder_email":
      return card;
    case "classify_card_with_ai": {
      if (!ctx.board) return card;
      const r = await classifyCardWithTogether({
        board: ctx.board,
        title: String(card.title || ""),
        description: String(card.desc || ""),
      });
      if (!r.ok || !r.data) return card;
      const d = r.data;
      let next: Record<string, unknown> = { ...card };
      if (d.priority) next.priority = d.priority;
      if (d.title) next.title = d.title.slice(0, 300);
      if (d.tags?.length) {
        const s = new Set([...tagList(card), ...d.tags.map((t) => String(t).trim())].filter(Boolean));
        next.tags = [...s].slice(0, 20);
      }
      if (d.bucketKey && bucketKeysExist(ctx.board, d.bucketKey)) {
        next.bucket = d.bucketKey;
      }
      return next;
    }
    case "generate_executive_brief_email":
      return card;
    default:
      return card;
  }
}

function markRuleFired(card: Record<string, unknown>, ruleId: string): Record<string, unknown> {
  const prev = (card.automationState as { lastFired?: Record<string, string> } | undefined)?.lastFired || {};
  return {
    ...card,
    automationState: {
      ...(typeof card.automationState === "object" ? card.automationState : {}),
      lastFired: { ...prev, [ruleId]: new Date().toISOString() },
    },
  };
}

export async function runSyncAutomationsOnBoardPut(args: {
  prevBoard: BoardData;
  nextCards: unknown[];
  boardId: string;
  orgId: string;
  boardName: string;
}): Promise<{ cards: unknown[]; changed: boolean }> {
  const rules = await getBoardAutomationRules(args.boardId, args.orgId);
  let cards = enrichCardsColumnTimestamps(args.prevBoard.cards as unknown[] | undefined, args.nextCards);
  const prevCards = (args.prevBoard.cards || []) as unknown[];

  const owner = await getUserById(args.prevBoard.ownerId, args.orgId);
  const ownerEmail = owner?.email || "";

  let changed = false;
  for (const rule of rules) {
    if (!rule.enabled) continue;
    const t = rule.trigger;
    if (t.type !== "card_moved_to_column" && t.type !== "card_created_with_tag") continue;

    const targetIds =
      t.type === "card_moved_to_column"
        ? findMovedToColumnIds(prevCards, cards, t.columnKey)
        : findNewCardIdsWithTag(prevCards, cards, t.tag);
    if (!targetIds.length) continue;

    const byId = new Map(cards.map((c) => [String((c as { id?: string })?.id), c as Record<string, unknown>]));
    for (const id of targetIds) {
      const cur = byId.get(id);
      if (!cur) continue;
      const next = await applyActionToCard({
        card: cur,
        rule,
        boardName: args.boardName,
        boardId: args.boardId,
        ownerEmail,
        orgId: args.orgId,
        board: { ...args.prevBoard, cards } as BoardData,
      });
      if (JSON.stringify(next) !== JSON.stringify(cur)) {
        byId.set(id, next);
        changed = true;
      }
    }
    cards = cards.map((c) => byId.get(String((c as { id?: string })?.id)) || c);
  }

  return { cards, changed };
}

export async function runFormSubmissionAutomations(args: {
  board: BoardData;
  cardId: string;
}): Promise<BoardData | null> {
  const orgId = args.board.orgId;
  const rules = await getBoardAutomationRules(args.board.id, orgId);
  const formRules = rules.filter((r) => r.enabled && r.trigger.type === "form_submission");
  if (!formRules.length) return null;

  const cards = [...(args.board.cards || [])] as Record<string, unknown>[];
  const idx = cards.findIndex((c) => String(c.id) === args.cardId);
  if (idx < 0) return null;

  const owner = await getUserById(args.board.ownerId, orgId);
  const ownerEmail = owner?.email || "";

  let changed = false;
  let card = cards[idx];
  for (const rule of formRules) {
    const next = await applyActionToCard({
      card,
      rule,
      boardName: args.board.name,
      boardId: args.board.id,
      ownerEmail,
      orgId,
      board: args.board,
    });
    if (JSON.stringify(next) !== JSON.stringify(card)) {
      card = next;
      changed = true;
    }
  }
  if (!changed) return null;
  cards[idx] = card;
  return updateBoardFromExisting(args.board, { cards } as Partial<BoardData>);
}

export async function runCronAutomationsForBoard(board: BoardData): Promise<BoardData | null> {
  const rules = await getBoardAutomationRules(board.id, board.orgId);
  const timeRules = rules.filter(
    (r) =>
      r.enabled &&
      (r.trigger.type === "card_stuck_in_column" ||
        r.trigger.type === "due_date_within_days" ||
        r.trigger.type === "board_completion_percent")
  );
  if (!timeRules.length) {
    const lastPct = board.automationBoardState?.lastCompletionPercent ?? 0;
    const cards = (board.cards || []) as unknown[];
    const currentPct = computeBoardCompletionPercent(cards);
    if (currentPct === lastPct) return null;
    return updateBoardFromExisting(board, {
      automationBoardState: { lastCompletionPercent: currentPct },
    });
  }

  const owner = await getUserById(board.ownerId, board.orgId);
  const ownerEmail = owner?.email || "";

  let cards = [...(board.cards || [])] as Record<string, unknown>[];
  let changed = false;
  const now = Date.now();
  const dayMs = 86400000;

  const lastPct = board.automationBoardState?.lastCompletionPercent ?? 0;
  const currentPct = computeBoardCompletionPercent(cards);

  for (const rule of rules) {
    if (!rule.enabled || rule.trigger.type !== "card_stuck_in_column") continue;
    const t = rule.trigger;
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      if (String(c.bucket || "") !== t.columnKey) continue;
      const entered = String(c.columnEnteredAt || "");
      if (!entered) continue;
      const daysStuck = (now - new Date(entered).getTime()) / dayMs;
      if (daysStuck < t.days) continue;
      const lastF = (c.automationState as { lastFired?: Record<string, string> } | undefined)?.lastFired?.[rule.id];
      if (lastF) continue;

      const next = await applyActionToCard({
        card: c,
        rule,
        boardName: board.name,
        boardId: board.id,
        ownerEmail,
        orgId: board.orgId,
        board,
      });
      cards[i] = markRuleFired(next, rule.id);
      changed = true;
    }
  }

  for (const rule of rules) {
    if (!rule.enabled || rule.trigger.type !== "due_date_within_days") continue;
    const N = rule.trigger.days;
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      const du = daysUntilDue(c.dueDate as string | null | undefined);
      if (du === null || du < 0 || du > N) continue;
      const lastF = (c.automationState as { lastFired?: Record<string, string> } | undefined)?.lastFired?.[rule.id];
      const iso = new Date().toISOString();
      if (lastF && isSameUtcDay(lastF, iso)) continue;

      if (rule.action.type === "send_due_reminder_email" && ownerEmail) {
        await sendAutomationEmail({
          to: ownerEmail,
          subject: `[Flux] Lembrete de prazo — ${String(c.title || "").slice(0, 80)}`,
          text: `Card ${String(c.id)}: "${String(c.title)}" vence em ${du} dia(s) (regra: ${rule.name || rule.id}).`,
        });
        cards[i] = markRuleFired(c, rule.id);
        changed = true;
      }
    }
  }

  if (currentPct !== lastPct) {
    changed = true;
  }

  for (const rule of rules) {
    if (!rule.enabled || rule.trigger.type !== "board_completion_percent") continue;
    const thr = rule.trigger.percent;
    if (currentPct >= thr && lastPct < thr && rule.action.type === "generate_executive_brief_email") {
      const gen = await generateExecutiveBriefTogether({
        boardName: board.name,
        cardsSummary: buildCardsSummary(cards),
      });
      if (gen.ok && gen.text && ownerEmail) {
        await sendAutomationEmail({
          to: ownerEmail,
          subject: `[Flux] Briefing executivo — ${board.name}`,
          text: gen.text,
        });
        changed = true;
      }
    }
  }

  const nextBoardState = { lastCompletionPercent: currentPct };
  if (!changed && currentPct === lastPct) return null;

  return updateBoardFromExisting(board, {
    cards,
    automationBoardState: nextBoardState,
  } as Partial<BoardData>);
}
