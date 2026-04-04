import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

function isProductionDeploy(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Valida `x-cron-secret` contra uma lista de variáveis de ambiente aceitas (primeiro valor definido ganha).
 *
 * - Em **produção**, é obrigatório haver pelo menos um segredo configurado; caso contrário retorna não autorizado.
 * - Em **desenvolvimento**, se nenhum segredo estiver definido, permite o job (facilita `next dev`).
 */
export function verifyCronSecret(request: NextRequest, envKeys: string[]): boolean {
  const header = request.headers.get("x-cron-secret") ?? "";
  const candidates = envKeys.map((k) => process.env[k]?.trim()).filter((v): v is string => Boolean(v));
  const required = candidates[0];

  if (!required) {
    if (isProductionDeploy()) return false;
    return true;
  }

  if (!header) return false;
  return candidates.some((c) => safeEqual(header, c));
}
