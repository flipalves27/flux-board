import { NextRequest, NextResponse } from "next/server";

import { routing } from "@/i18n";

import { getOAuthCallbackRequestOrigin } from "./base-url";

export function redirectToLoginWithOAuthError(req: NextRequest, locale: string, error: string): NextResponse {
  const origin = getOAuthCallbackRequestOrigin(req);
  const loc = (routing.locales as readonly string[]).includes(locale) ? locale : routing.defaultLocale;
  const url = new URL(`/${loc}/login`, origin);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url.toString(), 302);
}
