import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ensurePlatformAdmin } from "@/lib/api-authz";
import { listDeliveryLogs } from "@/lib/kv-webhooks";

export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensurePlatformAdmin(payload);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") || "100");
  const logs = await listDeliveryLogs(payload.orgId, limit);
  return NextResponse.json({
    deliveries: logs.map((d) => ({
      id: String(d._id),
      subscriptionId: d.subscriptionId,
      eventId: d.eventId,
      eventType: d.eventType,
      payload: d.payload,
      status: d.status,
      attempts: d.attempts,
      httpStatus: d.httpStatus,
      responseBody: d.responseBody,
      errorMessage: d.errorMessage,
      createdAt: d.createdAt,
      completedAt: d.completedAt,
    })),
  });
}
