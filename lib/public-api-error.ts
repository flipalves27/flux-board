import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { PlanGateError } from "@/lib/plan-gates";
import { WebhookUrlBlockedError } from "@/lib/webhook-url";

const isDev = process.env.NODE_ENV === "development";

function newRequestId(): string {
  return randomUUID();
}

/** Regista o erro completo no servidor (stack, mensagem original). */
export function logCaughtApiError(context: string, err: unknown, requestId: string): void {
  console.error(`[api] ${context} requestId=${requestId}`, err);
}

export type PublicApiErrorOptions = {
  /** Ex.: `GET /api/boards` — usado nos logs. */
  context?: string;
  /** Mensagem quando não é desenvolvimento ou o erro não é `Error`. */
  fallbackMessage?: string;
  /** Status HTTP se o erro não for `PlanGateError` nem `WebhookUrlBlockedError`. */
  status?: number;
  /** Correlacionar com logs (gerado se omitido). */
  requestId?: string;
};

/**
 * Corpo + status seguros para JSON de API.
 * - `PlanGateError`: mantém `error`, `code`, `feature`, tiers (contrato de produto).
 * - `WebhookUrlBlockedError`: mensagem controlada pela app.
 * - Outros: em produção/preview, mensagem genérica + `requestId`; em `NODE_ENV=development`, `Error.message`.
 */
export function toPublicApiErrorBody(
  err: unknown,
  options?: PublicApiErrorOptions
): { body: Record<string, unknown>; status: number } {
  const requestId = options?.requestId ?? newRequestId();
  const context = options?.context ?? "api";

  if (err instanceof PlanGateError) {
    return {
      status: err.status,
      body: {
        error: err.message,
        code: err.code,
        ...(err.feature !== undefined ? { feature: err.feature } : {}),
        ...(err.requiredTiers !== undefined ? { requiredTiers: err.requiredTiers } : {}),
        ...(err.currentTier !== undefined ? { currentTier: err.currentTier } : {}),
      },
    };
  }

  if (err instanceof WebhookUrlBlockedError) {
    return {
      status: options?.status ?? 400,
      body: { error: err.message, code: err.code },
    };
  }

  logCaughtApiError(context, err, requestId);

  const fallback = options?.fallbackMessage ?? "Erro interno";
  const status = options?.status ?? 500;

  if (isDev && err instanceof Error && err.message) {
    return { status, body: { error: err.message, requestId } };
  }

  return { status, body: { error: fallback, requestId } };
}

export function publicApiErrorResponse(err: unknown, options?: PublicApiErrorOptions): NextResponse {
  const { body, status } = toPublicApiErrorBody(err, options);
  return NextResponse.json(body, { status });
}

/** Mensagem segura sem log (ex.: erros por tool no copilot). */
export function clientSafeErrorText(err: unknown, fallback: string): string {
  if (isDev && err instanceof Error && err.message) return err.message;
  return fallback;
}

/** Campo `message` / `errorMessage` em respostas streaming ou objetos parciais. */
export function publicErrorMessage(err: unknown, fallback: string, context?: string): string {
  const requestId = newRequestId();
  if (err instanceof PlanGateError) return err.message;
  if (err instanceof WebhookUrlBlockedError) return err.message;
  logCaughtApiError(context ?? "api", err, requestId);
  if (isDev && err instanceof Error && err.message) return err.message;
  return fallback;
}

/** Payload para eventos SSE `error` sem expor causa interna fora de desenvolvimento. */
export function publicSseErrorPayload(
  err: unknown,
  context: string
): { message: string; code: string; requestId?: string; stack?: string } {
  const requestId = newRequestId();
  if (err instanceof PlanGateError) {
    return { message: err.message, code: String(err.code) };
  }
  logCaughtApiError(context, err, requestId);
  const e = err instanceof Error ? err : new Error(String(err));
  if (isDev) {
    return {
      message: e.message || "Erro interno",
      code: "internal",
      stack: e.stack,
    };
  }
  return {
    message: "Erro interno no processamento.",
    code: "internal",
    requestId,
  };
}
