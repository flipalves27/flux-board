import { NextRequest, NextResponse } from "next/server";
import { handleStripeWebhook } from "@/lib/billing";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const result = await handleStripeWebhook(request);
    return NextResponse.json(
      { received: true, handled: result.handled, ...(result.reason ? { reason: result.reason } : {}) },
      { status: result.status }
    );
  } catch (err) {
    console.error("Stripe webhook error:", err);
    return NextResponse.json({ received: true, handled: false, reason: "processing_error" }, { status: 200 });
  }
}

