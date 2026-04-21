import { nextBoardCardId } from "@/lib/card-id";
import { clientSafeErrorText } from "@/lib/public-api-error";
import { postFluxyNotifyStakeholdersFromCopilot } from "@/lib/fluxy-notify-from-copilot";
import type { CopilotAction, CopilotToolName, CopilotToolResult } from "./types";

const PRIORITIES = ["Urgente", "Importante", "Média"] as const;
const PROGRESSES = ["Não iniciado", "Em andamento", "Concluída"] as const;
const DIRECTIONS = ["Manter", "Priorizar", "Adiar", "Cancelar", "Reavaliar"] as const;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function normalizeTitle(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toLocalIsoDate(date: string): string | null {
  if (!date) return null;
  const d = new Date(`${date.trim()}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function prioritySafe(v: unknown): (typeof PRIORITIES)[number] | null {
  const s = String(v || "").trim();
  if ((PRIORITIES as readonly string[]).includes(s)) return s as (typeof PRIORITIES)[number];
  return null;
}

function progressSafe(v: unknown): (typeof PROGRESSES)[number] | null {
  const s = String(v || "").trim();
  if ((PROGRESSES as readonly string[]).includes(s)) return s as (typeof PROGRESSES)[number];
  return null;
}

function directionSafe(v: unknown): (typeof DIRECTIONS)[number] | null {
  const s = String(v || "").trim();
  if ((DIRECTIONS as readonly string[]).includes(s)) return s as (typeof DIRECTIONS)[number];
  if (!s) return null;
  return null;
}

function resolveBucketKey(board: Record<string, unknown>, bucketKeyOrLabel?: string, bucketLabelOrKey?: string): string | null {
  const boardConfig = (board.config ?? {}) as Record<string, unknown>;
  const bucketOrder = Array.isArray(boardConfig.bucketOrder) ? boardConfig.bucketOrder : [];
  const list = bucketOrder
    .filter((b) => b && typeof b === "object")
    .map((b) => {
      const row = b as Record<string, unknown>;
      return { key: String(row.key || ""), label: String(row.label || "") };
    })
    .filter((b) => b.key);

  if (list.length === 0) return null;

  const byKey = list.find((b) => b.key.toLowerCase() === String(bucketKeyOrLabel || "").trim().toLowerCase());
  if (byKey) return byKey.key;

  const byLabel = list.find((b) => b.label.toLowerCase() === String(bucketLabelOrKey || bucketKeyOrLabel || "").trim().toLowerCase());
  if (byLabel) return byLabel.key;

  const raw = String(bucketLabelOrKey || bucketKeyOrLabel || "").trim().toLowerCase();
  if (!raw) return null;

  const labelIncludes = list.find((b) => b.label.toLowerCase().includes(raw));
  if (labelIncludes) return labelIncludes.key;

  const keyIncludes = list.find((b) => b.key.toLowerCase().includes(raw));
  if (keyIncludes) return keyIncludes.key;

  if (raw.length >= 2) {
    const rawIncludesLabel = list.find((b) => b.label.toLowerCase().length >= 2 && raw.includes(b.label.toLowerCase()));
    if (rawIncludesLabel) return rawIncludesLabel.key;

    const rawIncludesKey = list.find((b) => b.key.toLowerCase().length >= 2 && raw.includes(b.key.toLowerCase()));
    if (rawIncludesKey) return rawIncludesKey.key;
  }

  return null;
}

const BUCKET_TOOL_ARG_ALIASES = [
  "bucketKey",
  "bucketLabel",
  "bucket",
  "column",
  "coluna",
  "targetBucket",
  "columnKey",
  "columnLabel",
  "para",
  "destino",
] as const;

function firstBucketKey(board: Record<string, unknown>): string | null {
  const boardConfig = (board.config ?? {}) as Record<string, unknown>;
  const bucketOrder = Array.isArray(boardConfig.bucketOrder) ? boardConfig.bucketOrder : [];
  const first = bucketOrder.find((b) => {
    const row = (b ?? {}) as Record<string, unknown>;
    return String(row.key || "").trim();
  }) as Record<string, unknown> | undefined;
  return first ? String(first.key) : null;
}

function resolveBucketKeyFromToolArgs(board: Record<string, unknown>, args: Record<string, unknown>): string | null {
  const bk = args.bucketKey != null ? String(args.bucketKey).trim() : "";
  const bl = args.bucketLabel != null ? String(args.bucketLabel).trim() : "";
  const fromPair = resolveBucketKey(board, bk || undefined, bl || undefined);
  if (fromPair) return fromPair;

  for (const key of BUCKET_TOOL_ARG_ALIASES) {
    const v = args[key];
    if (v == null) continue;
    const s = String(v).trim();
    if (!s) continue;
    const resolved = resolveBucketKey(board, s, s);
    if (resolved) return resolved;
  }
  return null;
}

function resolveCardId(cards: Array<Record<string, unknown>>, cardIdOrTitle: string): string | null {
  const raw = String(cardIdOrTitle || "").trim();
  if (!raw) return null;
  const exact = cards.find((c) => String(c.id || "") === raw);
  if (exact?.id) return String(exact.id);

  const nt = normalizeTitle(raw);
  if (!nt) return null;
  const byTitle = cards.filter((c) => normalizeTitle(String(c.title || "")) === nt);
  if (byTitle.length === 1) return String(byTitle[0].id);
  return null;
}

function cardsSortedByBucket(cards: Array<Record<string, unknown>>, bucketOrderKeys: string[]): Array<Record<string, unknown>> {
  const bucketKeys = Array.from(new Set([...bucketOrderKeys, ...cards.map((c) => String(c.bucket || ""))])).filter(Boolean);
  const next: Array<Record<string, unknown>> = [];
  for (const bk of bucketKeys) {
    const bucketCards = cards
      .filter((c) => String(c.bucket || "") === bk)
      .sort((a, b) => (Number(a.order ?? 0) || 0) - (Number(b.order ?? 0) || 0));
    bucketCards.forEach((c, i) => (c.order = i));
    next.push(...bucketCards);
  }
  return next;
}

function shouldUseActionsFromUserMessage(userMessage: string): boolean {
  return /(mover|mova|ajustar|ajuste|prioridade|criar|novo card|crie|atualizar card)/i.test(String(userMessage || ""));
}

function allowNotifyStakeholdersTool(userMessage: string): boolean {
  return /(notific|avisa|alerta|cobre|ping|respons[aá]vel|equipa|equipe)/i.test(String(userMessage || ""));
}

export async function executeCopilotActions(params: {
  board: Record<string, unknown>;
  boardId: string;
  actions: CopilotAction[];
  userMessage: string;
  generateBrief: () => string;
  notifyContext?: {
    orgId: string;
    userId: string;
    username: string;
    isAdmin: boolean;
    orgRole: string;
  };
}): Promise<{ updatedCards?: Array<Record<string, unknown>>; toolResults: CopilotToolResult[] }> {
  const { board, actions, userMessage, generateBrief, boardId, notifyContext } = params;
  let cards = Array.isArray(board.cards) ? ([...board.cards] as Array<Record<string, unknown>>) : [];
  const boardConfig = (board.config ?? {}) as Record<string, unknown>;
  const bucketOrder = Array.isArray(boardConfig.bucketOrder) ? boardConfig.bucketOrder : [];
  const bucketOrderKeys = bucketOrder.map((b) => String(((b ?? {}) as Record<string, unknown>).key || "")).filter(Boolean);

  const toolResults: CopilotToolResult[] = [];
  const allowMutations = shouldUseActionsFromUserMessage(userMessage);

  for (const action of actions) {
    const tool = action.tool;
    const args = action.args || {};

    try {
      if (tool === "moveCard") {
        if (!allowMutations) {
          toolResults.push({ tool, ok: false, message: "Ação ignorada: o usuário não pediu alteração explícita." });
          continue;
        }
        const cardIdRaw = String(args.cardId || "").trim();
        const cardId = resolveCardId(cards, cardIdRaw);
        if (!cardId) throw new Error("cardId/card title inválido ou não encontrado.");
        const cardIdx = cards.findIndex((c) => String(c.id) === cardId);
        if (cardIdx < 0) throw new Error(`Card não encontrado: ${cardId}`);

        const bucketKey = resolveBucketKeyFromToolArgs(board, args);
        if (!bucketKey) throw new Error("bucketKey/bucketLabel inválido ou ausente.");

        const targetIndexRaw = args.targetIndex;
        const bucketCards = cards
          .filter((c) => String(c.bucket || "") === bucketKey && String(c.id) !== cardId)
          .sort((a, b) => (Number(a.order ?? 0) || 0) - (Number(b.order ?? 0) || 0));
        const targetIndex = typeof targetIndexRaw === "number" ? clamp(targetIndexRaw, 0, bucketCards.length) : bucketCards.length;

        const setProgress = args.setProgress ? progressSafe(args.setProgress) : null;
        const card: Record<string, unknown> = { ...cards[cardIdx], bucket: bucketKey };
        if (setProgress) card.progress = setProgress;

        const without = cards.filter((c) => String(c.id) !== cardId);
        const existingTarget = without
          .filter((c) => String(c.bucket || "") === bucketKey)
          .sort((a, b) => (Number(a.order ?? 0) || 0) - (Number(b.order ?? 0) || 0));
        existingTarget.splice(targetIndex, 0, card);
        existingTarget.forEach((c, i) => (c.order = i));

        const otherBuckets = without.filter((c) => String(c.bucket || "") !== bucketKey);
        cards = cardsSortedByBucket([...otherBuckets, ...existingTarget], bucketOrderKeys);

        toolResults.push({
          tool,
          ok: true,
          message: `Movido card ${cardId} para ${bucketKey}.`,
          data: { cardId, bucketKey, setProgress: setProgress ?? undefined },
        });
        continue;
      }

      if (tool === "updatePriority") {
        if (!allowMutations) {
          toolResults.push({ tool, ok: false, message: "Ação ignorada: o usuário não pediu alteração explícita." });
          continue;
        }
        const cardIdRaw = String(args.cardId || "").trim();
        const cardId = resolveCardId(cards, cardIdRaw);
        const prio = prioritySafe(args.priority);
        if (!cardId) throw new Error("cardId/card title inválido ou não encontrado.");
        if (!prio) throw new Error("priority inválida.");

        cards = cards.map((c) => (String(c.id) === cardId ? { ...c, priority: prio } : c));
        toolResults.push({
          tool,
          ok: true,
          message: `Prioridade do card ${cardId} ajustada para ${prio}.`,
          data: { cardId, priority: prio },
        });
        continue;
      }

      if (tool === "createCard") {
        if (!allowMutations) {
          toolResults.push({ tool, ok: false, message: "Ação ignorada: o usuário não pediu alteração explícita." });
          continue;
        }
        const title = String(args.title || "").trim();
        if (!title) throw new Error("title obrigatório para createCard.");

        let bucketKey = resolveBucketKeyFromToolArgs(board, args);
        if (!bucketKey) bucketKey = firstBucketKey(board);
        if (!bucketKey) throw new Error("bucketKey/bucketLabel inválido ou ausente (e não há colunas no board).");

        const prio = prioritySafe(args.priority) || "Média";
        const prog = progressSafe(args.progress) || "Não iniciado";
        const desc = args.desc != null ? String(args.desc) : "";
        const tags = Array.isArray(args.tags) ? args.tags.map((t) => String(t || "").trim()).filter(Boolean).slice(0, 30) : [];
        const dir = args.direction === null || args.direction === undefined ? null : directionSafe(args.direction) ?? null;
        const dueDate = args.dueDate === null || args.dueDate === undefined ? null : toLocalIsoDate(String(args.dueDate)) ?? null;

        const id = nextBoardCardId(cards.map((c) => String(c.id)));
        const bucketCards = cards
          .filter((c) => String(c.bucket || "") === bucketKey)
          .sort((a, b) => (Number(a.order ?? 0) || 0) - (Number(b.order ?? 0) || 0));
        const order = bucketCards.length;

        const newCard: Record<string, unknown> = {
          id,
          bucket: bucketKey,
          priority: prio,
          progress: prog,
          title,
          desc,
          tags,
          direction: dir,
          dueDate,
          order,
        };

        cards = cardsSortedByBucket([...cards, newCard], bucketOrderKeys);
        toolResults.push({ tool, ok: true, message: `Card criado: ${title}`, data: { cardId: id, progress: prog } });
        continue;
      }

      if (tool === "generateBrief") {
        const brief = generateBrief();
        toolResults.push({ tool, ok: true, message: "Brief gerado.", data: { brief } });
        continue;
      }

      if (tool === "notifyStakeholders") {
        if (!notifyContext) {
          toolResults.push({ tool, ok: false, message: "Contexto do Copilot em falta para notificar." });
          continue;
        }
        if (!allowNotifyStakeholdersTool(userMessage)) {
          toolResults.push({ tool, ok: false, message: "Peça explicitamente para notificar pessoas (ex.: avisar o responsável)." });
          continue;
        }
        const body = String(args.message ?? args.body ?? "").trim();
        if (!body) throw new Error("message (texto da notificação) é obrigatório.");
        const ids = Array.isArray(args.userIds) ? args.userIds.map((x) => String(x || "").trim()).filter(Boolean) : [];
        if (!ids.length) throw new Error("userIds deve listar pelo menos um ID de membro da organização.");
        let cardKey: string | null = args.cardId != null ? String(args.cardId).trim() : "";
        if (cardKey) {
          cardKey = resolveCardId(cards, cardKey);
        } else {
          cardKey = null;
        }
        const res = await postFluxyNotifyStakeholdersFromCopilot({
          orgId: notifyContext.orgId,
          boardId,
          senderId: notifyContext.userId,
          senderOrgRole: notifyContext.orgRole,
          isAdmin: notifyContext.isAdmin,
          cardId: cardKey,
          body,
          targetUserIds: ids,
        });
        if (!res.ok) {
          toolResults.push({ tool, ok: false, message: res.message });
          continue;
        }
        toolResults.push({
          tool,
          ok: true,
          message: `Notificação enviada pela Sala Fluxy (${res.notified} destinatário(s)).`,
          data: { notified: res.notified },
        });
        continue;
      }

      toolResults.push({ tool, ok: false, message: "Tool desconhecida." });
    } catch (err) {
      toolResults.push({
        tool: action.tool,
        ok: false,
        message: clientSafeErrorText(err, "Erro ao executar tool."),
      });
    }
  }

  return { updatedCards: cards, toolResults };
}

export function formatAssistantReply(params: { reply: string; toolResults: CopilotToolResult[] }): string {
  const { reply, toolResults } = params;
  const brief = toolResults.find((r) => r.ok && r.tool === "generateBrief")?.data as { brief?: string } | undefined;
  const appliedMutations = toolResults.filter(
    (r) => r.ok && (r.tool === "moveCard" || r.tool === "updatePriority" || r.tool === "createCard")
  );

  const parts: string[] = [reply.trim()];
  if (brief?.brief && brief.brief.trim()) {
    parts.push("", "## Brief para diretoria", brief.brief.trim());
  }
  if (appliedMutations.length) {
    parts.push("", "## Ações aplicadas");
    for (const r of appliedMutations) parts.push(`- ${r.message}`);
  }
  const notifyOk = toolResults.filter((r) => r.ok && r.tool === "notifyStakeholders");
  if (notifyOk.length) {
    parts.push("", "## Notificações");
    for (const r of notifyOk) parts.push(`- ${r.message}`);
  }
  return parts.join("\n");
}

