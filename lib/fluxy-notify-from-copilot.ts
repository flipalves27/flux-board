import { createFluxyMessage } from "@/lib/kv-fluxy-messages";
import { publishFluxyMessageCreated } from "@/lib/fluxy-message-stream";
import { finalizeFluxyMessageSideEffects } from "@/lib/fluxy-message-post";
import { listUsers } from "@/lib/kv-users";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";

function toFluxyParticipantRole(r: string): "gestor" | "membro" | "convidado" {
  if (r === "gestor") return "gestor";
  if (r === "convidado") return "convidado";
  return "membro";
}

/**
 * Cria mensagem na Sala Fluxy do board e dispara o mesmo pipeline de push/atividades (Copilot tool).
 */
export async function postFluxyNotifyStakeholdersFromCopilot(params: {
  orgId: string;
  boardId: string;
  senderId: string;
  senderOrgRole: string;
  isAdmin: boolean;
  cardId: string | null;
  body: string;
  targetUserIds: string[];
}): Promise<{ ok: true; notified: number } | { ok: false; message: string }> {
  const can = await userCanAccessBoard(params.senderId, params.orgId, params.isAdmin, params.boardId);
  if (!can) return { ok: false, message: "Sem permissão neste board." };

  const valid = new Set((await listUsers(params.orgId)).map((u) => u.id));
  const targets = [...new Set(params.targetUserIds.map((x) => String(x || "").trim()).filter(Boolean))]
    .filter((id) => valid.has(id))
    .slice(0, 50);
  if (!targets.length) return { ok: false, message: "Nenhum destinatário válido (IDs de membros da org)." };

  if (params.cardId) {
    const b = await getBoard(params.boardId, params.orgId);
    const cards = Array.isArray(b?.cards) ? b.cards : [];
    const exists = cards.some((c) => c && typeof c === "object" && String((c as { id?: string }).id) === params.cardId);
    if (!exists) return { ok: false, message: "Card inválido neste board." };
  }

  const role = toFluxyParticipantRole(params.senderOrgRole);
  const mentions = targets.map((userId) => ({
    token: "Fluxy",
    userId,
    kind: "implicit" as const,
  }));

  const message = await createFluxyMessage({
    orgId: params.orgId,
    boardId: params.boardId,
    body: params.body,
    conversationScope: "board",
    relatedCardId: null,
    contextCardId: params.cardId,
    participants: [{ userId: params.senderId, role }],
    mentions,
    targetUserIds: targets,
    createdBy: { userId: params.senderId, role },
    mediatedByFluxy: true,
  });

  publishFluxyMessageCreated({
    boardId: params.boardId,
    relatedCardId: params.cardId,
    messageId: message.id,
    createdAt: message.createdAt,
  });

  await finalizeFluxyMessageSideEffects({
    orgId: params.orgId,
    boardId: params.boardId,
    senderId: params.senderId,
    message,
  });

  return { ok: true, notified: targets.length };
}
