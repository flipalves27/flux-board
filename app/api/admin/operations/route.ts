import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { ensurePlatformAdmin } from "@/lib/api-authz";
import { listPushOutbox } from "@/lib/kv-push-subscriptions";
import { listIntegrationEventLogs } from "@/lib/kv-integrations";
import { listPublicApiTokens } from "@/lib/public-api-tokens";

export async function GET(request: NextRequest) {
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const denied = ensurePlatformAdmin(payload);
  if (denied) return denied;

  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") || "50"), 1), 200);
  const orgId = request.nextUrl.searchParams.get("orgId")?.trim() || undefined;
  const provider = request.nextUrl.searchParams.get("provider")?.trim() || undefined;
  const status = request.nextUrl.searchParams.get("status")?.trim() || undefined;
  const tokenState = request.nextUrl.searchParams.get("tokenState")?.trim() || undefined;
  const [pushOutbox, integrationLogs, tokens] = await Promise.all([
    listPushOutbox({ limit, orgId }),
    listIntegrationEventLogs({ limit, orgId, provider: provider === "github" || provider === "gitlab" ? provider : undefined }),
    listPublicApiTokens(),
  ]);
  const filteredIntegrationLogs =
    status && status !== "all" ? integrationLogs.filter((x) => (x.status ?? "received") === status) : integrationLogs;
  const filteredTokens =
    tokenState === "active"
      ? tokens.filter((x) => x.active)
      : tokenState === "revoked"
        ? tokens.filter((x) => !x.active)
        : tokens;
  const filteredTokensByOrg = orgId ? filteredTokens.filter((x) => x.orgId === orgId) : filteredTokens;

  return NextResponse.json({
    pushOutbox: {
      total: pushOutbox.length,
      dueNow: pushOutbox.filter((x) => x.nextAttemptAt <= new Date().toISOString()).length,
      items: pushOutbox,
    },
    integrationLogs: {
      total: filteredIntegrationLogs.length,
      synced: filteredIntegrationLogs.filter((x) => x.status === "synced").length,
      failed: filteredIntegrationLogs.filter((x) => x.status === "failed").length,
      items: filteredIntegrationLogs,
    },
    publicApiTokens: {
      total: filteredTokensByOrg.length,
      active: filteredTokensByOrg.filter((x) => x.active).length,
      items: filteredTokensByOrg.map((t) => ({
        id: t._id,
        name: t.name,
        orgId: t.orgId,
        keyPrefix: t.keyPrefix,
        scopes: t.scopes,
        active: t.active,
        updatedAt: t.updatedAt,
      })),
    },
  });
}

