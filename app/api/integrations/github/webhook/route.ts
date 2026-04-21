import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { appendIntegrationEventLog, getIntegrationConnectionByExternalOrg } from "@/lib/kv-integrations";
import { getDb, isMongoConfigured } from "@/lib/mongo";
import { updateBoardFromExisting } from "@/lib/kv-boards";
import { consumeWebhookDelivery } from "@/lib/webhook-replay";

export const runtime = "nodejs";

function isValidGithubSignature(raw: string, signature: string, secret: string): boolean {
  const digest = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const expected = `sha256=${digest}`;
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const eventType = request.headers.get("x-github-event") ?? "unknown";
  const deliveryId = request.headers.get("x-github-delivery");
  const secret = process.env.GITHUB_WEBHOOK_SECRET?.trim();
  const payload = JSON.parse(raw || "{}") as {
    action?: string;
    pull_request?: { merged?: boolean; html_url?: string; body?: string; title?: string; head?: { ref?: string } };
    repository?: { owner?: { login?: string } };
  };

  if (secret) {
    if (!signature || !isValidGithubSignature(raw, signature, secret)) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
    }
  }
  const replay = await consumeWebhookDelivery({ provider: "github", deliveryId });
  if (!replay.accepted) {
    return NextResponse.json({ error: "Replay detected." }, { status: 409 });
  }

  await appendIntegrationEventLog({
    orgId: "integration_unbound",
    provider: "github",
    eventType,
    status: "received",
    deliveryId,
  });

  if (eventType === "pull_request") {
    const externalOrg = String(payload.repository?.owner?.login ?? "").trim();
    const connection = externalOrg
      ? await getIntegrationConnectionByExternalOrg({ provider: "github", externalOrgId: externalOrg })
      : null;
    if (connection?.orgId) {
      const sourceText = [
        payload.pull_request?.head?.ref,
        payload.pull_request?.title,
        payload.pull_request?.body,
      ]
        .filter(Boolean)
        .join(" ");
      const cardIdMatch = sourceText.match(/\bc_[a-zA-Z0-9_-]+\b/);
      const cardId = cardIdMatch?.[0] ?? null;
      if (cardId) {
        await syncCardFromGithubPr({
          orgId: connection.orgId,
          cardId,
          action: String(payload.action ?? ""),
          merged: Boolean(payload.pull_request?.merged),
          prUrl: String(payload.pull_request?.html_url ?? ""),
        });
        await appendIntegrationEventLog({
          orgId: connection.orgId,
          provider: "github",
          eventType,
          status: "synced",
          message: `Card ${cardId} synced from PR event.`,
          deliveryId,
        });
      } else {
        await appendIntegrationEventLog({
          orgId: connection.orgId,
          provider: "github",
          eventType,
          status: "ignored",
          message: "No card id pattern found in PR payload.",
          deliveryId,
        });
      }
    }
  }

  return NextResponse.json({ ok: true, queued: false, eventType });
}

async function syncCardFromGithubPr(input: {
  orgId: string;
  cardId: string;
  action: string;
  merged: boolean;
  prUrl: string;
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
    const notes = input.prUrl ? `\n[GitHub PR] ${input.prUrl}` : "";
    const merged = input.action === "closed" && input.merged;
    const next = {
      ...card,
      ...(merged ? { progress: "Concluída" } : {}),
      tags: Array.from(new Set([...tags, merged ? "github:pr-merged" : "github:pr-open"])),
      desc: `${String(card.desc ?? "")}${notes}`.trim(),
    };
    const nextCards = [...cards];
    nextCards[idx] = next;
    const boardData = { ...board, id: String(board._id) };
    await updateBoardFromExisting(boardData as any, { cards: nextCards } as any);
    break;
  }
}

