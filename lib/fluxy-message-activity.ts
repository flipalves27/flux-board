import type { BoardActivityContext, BoardActivityDelta } from "./board-activity-types";
import { scheduleBoardActivityWrites } from "./board-activity-log";

/**
 * Mensagem Fluxy enviada + menções (trilha auditável).
 */
export function scheduleFluxyMessageActivities(
  ctx: BoardActivityContext & { boardId: string },
  params: {
    messageId: string;
    conversationScope: "board" | "card" | "direct";
    relatedCardId: string | null;
    preview: string;
    mediatedByFluxy: boolean;
    /** Destinatários de notificação (exclui remetente). */
    mentionUserIds: string[];
  }
): void {
  const target = params.preview.trim().slice(0, 220) || "Mensagem Fluxy";
  const deltas: BoardActivityDelta[] = [
    {
      action: "message.sent",
      target,
      details: {
        messageId: params.messageId,
        conversationScope: params.conversationScope,
        relatedCardId: params.relatedCardId,
        mediatedByFluxy: params.mediatedByFluxy,
        mentionCount: params.mentionUserIds.length,
      },
    },
  ];
  if (params.mentionUserIds.length > 0) {
    deltas.push({
      action: "message.mentioned",
      target: `${params.mentionUserIds.length} destinatário(s)`,
      details: {
        messageId: params.messageId,
        mentionedUserIds: params.mentionUserIds,
        relatedCardId: params.relatedCardId,
      },
    });
  }
  scheduleBoardActivityWrites(deltas, ctx);
}

/** Fluxy interpretou a mensagem (NLP / intenção) — usar a partir do motor de intenção. */
export function scheduleFluxyInterpretedActivity(
  ctx: BoardActivityContext & { boardId: string },
  params: {
    messageId: string;
    relatedCardId: string | null;
    summary: string;
    intent?: string | null;
    policyDecision?: "auto_applied" | "confirmation_required" | "no_action";
    riskLevel?: "low" | "medium" | "high";
  }
): void {
  scheduleBoardActivityWrites(
    [
      {
        action: "message.fluxy_interpreted",
        target: params.summary.trim().slice(0, 220),
        details: {
          messageId: params.messageId,
          relatedCardId: params.relatedCardId,
          intent: params.intent ?? null,
          policyDecision: params.policyDecision ?? null,
          riskLevel: params.riskLevel ?? null,
        },
      },
    ],
    ctx
  );
}

/** Ação da Fluxy aplicada ao card (com política de confirmação no fluxo de produto). */
export function scheduleFluxyActionAppliedActivity(
  ctx: BoardActivityContext & { boardId: string },
  params: {
    messageId: string | null;
    cardId: string;
    action: string;
    details?: Record<string, unknown> | null;
  }
): void {
  scheduleBoardActivityWrites(
    [
      {
        action: "message.fluxy_action_applied",
        target: params.action.slice(0, 220),
        details: {
          messageId: params.messageId,
          cardId: params.cardId,
          ...(params.details ?? {}),
        },
      },
    ],
    ctx
  );
}
