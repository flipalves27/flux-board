import { NextRequest, NextResponse } from "next/server";

import { routing } from "@/i18n";

import { getOAuthCallbackRequestOrigin } from "./base-url";
import { sanitizeOAuthReturnPath } from "./safe-redirect";

export function redirectToLoginWithOAuthError(
  req: NextRequest,
  locale: string,
  error: string,
  /** Caminho relativo guardado no cookie de start (ex.: /pt-BR/board/b_1) para o utilizador poder voltar a tentar. */
  returnPath?: string | null
): NextResponse {
  const origin = getOAuthCallbackRequestOrigin(req);
  const loc = (routing.locales as readonly string[]).includes(locale) ? locale : routing.defaultLocale;
  const url = new URL(`/${loc}/login`, origin);
  url.searchParams.set("error", error);
  const safe = sanitizeOAuthReturnPath(returnPath ?? undefined);
  if (safe) url.searchParams.set("redirect", safe);
  return NextResponse.redirect(url.toString(), 302);
}
