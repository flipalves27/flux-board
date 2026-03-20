import { NextRequest, NextResponse } from "next/server";
import { handleStripeWebhook } from "@/lib/billing";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const result = await handleStripeWebhook(request);
    // Para webhook, sempre retornamos 2xx para evitar retry infinito.
    return NextResponse.json({ received: true, handled: result.handled }, { status: 200 });
  } catch (err) {
    console.error("Stripe webhook error:", err);
    return NextResponse.json({ received: true, handled: false }, { status: 200 });
  }
}

