import { NextRequest, NextResponse } from "next/server";
import { appendIntegrationEventLog, getIntegrationConnectionByExternalOrg } from "@/lib/kv-integrations";
import { getDb, isMongoConfigured } from "@/lib/mongo";
import { updateBoardFromExisting } from "@/lib/kv-boards";
import { consumeWebhookDelivery } from "@/lib/webhook-replay";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const token = request.headers.get("x-gitlab-token");
  const eventType = request.headers.get("x-gitlab-event") ?? "unknown";
  const deliveryId = request.headers.get("x-request-id");
  const configuredToken = process.env.GITLAB_WEBHOOK_SECRET?.trim();
  const payload = JSON.parse(raw || "{}") as {
    object_kind?: string;
    object_attributes?: { state?: string; action?: string; url?: string; source_branch?: string; title?: string; description?: string };
    project?: { namespace?: string };
  };

  if (configuredToken && token !== configuredToken) {
    return NextResponse.json({ error: "Invalid webhook token." }, { status: 401 });
  }
  const replay = await consumeWebhookDelivery({ provider: "gitlab", deliveryId });
  if (!replay.accepted) {
    return NextResponse.json({ error: "Replay detected." }, { status: 409 });
  }

  await appendIntegrationEventLog({
    orgId: "integration_unbound",
    provider: "gitlab",
    eventType,
    status: "received",
    deliveryId,
  });

  if (eventType.toLowerCase().includes("merge")) {
    const externalOrg = String(payload.project?.namespace ?? "").trim();
    const connection = externalOrg
      ? await getIntegrationConnectionByExternalOrg({ provider: "gitlab", externalOrgId: externalOrg })
      : null;
    if (connection?.orgId) {
      const sourceText = [
        payload.object_attributes?.source_branch,
        payload.object_attributes?.title,
        payload.object_attributes?.description,
      ]
        .filter(Boolean)
        .join(" ");
      const cardIdMatch = sourceText.match(/\bc_[a-zA-Z0-9_-]+\b/);
      const cardId = cardIdMatch?.[0] ?? null;
      if (cardId) {
        const state = String(payload.object_attributes?.state ?? payload.object_attributes?.action ?? "");
        const merged = state.toLowerCase() === "merged";
        await syncCardFromGitlabMr({
          orgId: connection.orgId,
          cardId,
          merged,
          mrUrl: String(payload.object_attributes?.url ?? ""),
        });
        await appendIntegrationEventLog({
          orgId: connection.orgId,
          provider: "gitlab",
          eventType,
          status: "synced",
          message: `Card ${cardId} synced from MR event.`,
          deliveryId,
        });
      } else {
        await appendIntegrationEventLog({
          orgId: connection.orgId,
          provider: "gitlab",
          eventType,
          status: "ignored",
          message: "No card id pattern found in MR payload.",
          deliveryId,
        });
      }
    }
  }

  return NextResponse.json({ ok: true, queued: false, eventType });
}

async function syncCardFromGitlabMr(input: {
  orgId: string;
  cardId: string;
  merged: boolean;
  mrUrl: string;
}): Promise<void> {
  if (!isMongoConfigured()) return;
  const db = await getDb();
  const boards = await db
    .collection<{ _id: string; orgId: string; cards?: Array<Record<string, unknown>>; [k: string]: unknown }>("boards")
    .find({ orgId: input.orgId }, { projection: { _id: 1, orgId: 1, cards: 1, ownerId: 1, name: 1, config: 1 } })
    .limit(300)
    .toArray();

  for (const board of boards) {
    const cards = Array.isArray(board.cards) ? board.cards : [];
    const idx = cards.findIndex((c) => String(c.id ?? "") === input.cardId);
    if (idx < 0) continue;
    const card = cards[idx];
    const tags = Array.isArray(card.tags) ? card.tags.map((t) => String(t)) : [];
    const notes = input.mrUrl ? `\n[GitLab MR] ${input.mrUrl}` : "";
    const next = {
      ...card,
      ...(input.merged ? { progress: "Concluída" } : {}),
      tags: Array.from(new Set([...tags, input.merged ? "gitlab:mr-merged" : "gitlab:mr-open"])),
      desc: `${String(card.desc ?? "")}${notes}`.trim(),
    };
    const nextCards = [...cards];
    nextCards[idx] = next;
    const boardData = { ...board, id: String(board._id) };
    await updateBoardFromExisting(boardData as any, { cards: nextCards } as any);
    break;
  }
}

