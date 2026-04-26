import { NextResponse } from "next/server";
import { getPublicCommercialCatalogResilient } from "@/lib/platform-commercial-settings";

export const runtime = "nodejs";

/** Catálogo público: preços de vitrine e planos habilitados (sem segredos). */
export async function GET() {
  try {
    const catalog = await getPublicCommercialCatalogResilient();
    return NextResponse.json(catalog, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    });
  } catch (err) {
    console.error("[commercial-catalog]", err);
    return NextResponse.json({ error: "Erro ao carregar catálogo." }, { status: 500 });
  }
}
