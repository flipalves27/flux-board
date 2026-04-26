import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getManualSearchRecordsForLocale } from "@/lib/manual-chunks";
import type { ManualLocale } from "@/lib/manual-types";

export const runtime = "nodejs";

/**
 * JSON para índice Fuse (busca) no cliente — requer sessão, sem dados de org.
 */
export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const loc = request.nextUrl.searchParams.get("locale") as ManualLocale | null;
  const locale: ManualLocale = loc === "en" || loc === "pt-BR" ? loc : "pt-BR";
  const items = getManualSearchRecordsForLocale(locale);
  return NextResponse.json({ items, locale });
}
