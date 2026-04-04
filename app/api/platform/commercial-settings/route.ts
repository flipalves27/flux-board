import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { getAuthFromRequest } from "@/lib/auth";
import { ensurePlatformAdmin } from "@/lib/api-authz";
import {
  COMMERCIAL_SETTINGS_CACHE_TAG,
  getPlatformCommercialDocUncached,
  mergeDisplayPricingFromDoc,
  catalogFlagsFromDoc,
  updatePlatformCommercialSettings,
} from "@/lib/platform-commercial-settings";
import { PlatformCommercialSettingsPatchSchema, zodErrorToMessage } from "@/lib/schemas";

export const runtime = "nodejs";

function revalidateCommercialPages() {
  revalidateTag(COMMERCIAL_SETTINGS_CACHE_TAG);
  for (const locale of ["pt-BR", "en"] as const) {
    revalidatePath(`/${locale}`, "page");
    revalidatePath(`/${locale}/billing`, "page");
    revalidatePath(`/${locale}/admin/platform-commercial`, "page");
  }
  revalidatePath("/", "page");
  revalidatePath("/billing", "page");
  revalidatePath("/admin/platform-commercial", "page");
}

export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensurePlatformAdmin(payload);
  if (denied) return denied;

  try {
    const doc = await getPlatformCommercialDocUncached();
    const flags = catalogFlagsFromDoc(doc);
    const pricing = mergeDisplayPricingFromDoc(doc);
    return NextResponse.json({
      settings: doc,
      effective: { ...flags, pricing },
    });
  } catch (err) {
    console.error("[commercial-settings GET]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro interno" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensurePlatformAdmin(payload);
  if (denied) return denied;

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = PlatformCommercialSettingsPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
    }
    const d = parsed.data;
    await updatePlatformCommercialSettings({
      proEnabled: d.proEnabled,
      businessEnabled: d.businessEnabled,
      proSeatMonth: d.proSeatMonth,
      proSeatYear: d.proSeatYear,
      businessSeatMonth: d.businessSeatMonth,
      businessSeatYear: d.businessSeatYear,
      publishStripe: d.publishStripe ?? false,
    });
    revalidateCommercialPages();
    const doc = await getPlatformCommercialDocUncached();
    return NextResponse.json({
      ok: true,
      settings: doc,
      effective: { ...catalogFlagsFromDoc(doc), pricing: mergeDisplayPricingFromDoc(doc) },
    });
  } catch (err) {
    console.error("[commercial-settings PATCH]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao salvar configuração." },
      { status: 400 }
    );
  }
}
