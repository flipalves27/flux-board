import { NextRequest, NextResponse } from "next/server";

import { routing } from "@/i18n";

import { getOAuthPublicBaseUrl } from "./base-url";

export function redirectToLoginWithOAuthError(req: NextRequest, locale: string, error: string): NextResponse {
  const base = getOAuthPublicBaseUrl(req);
  const loc = (routing.locales as readonly string[]).includes(locale) ? locale : routing.defaultLocale;
  const url = new URL(`/${loc}/login`, base);
  url.searchParams.set("error", error);
  return NextResponse.redirect(url.toString(), 302);
}
