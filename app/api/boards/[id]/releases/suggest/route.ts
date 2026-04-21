import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxFromAuthPayload } from "@/lib/plan-gates";
import { listReleases } from "@/lib/kv-releases";
import { listSprints } from "@/lib/kv-sprints";
import {
  buildChangelogFromCards,
  bumpSemver,
  suggestVersionType,
  type CardLike,
} from "@/lib/release-ai";

export const runtime = "nodejs";

/**
 * Suggest next release payload for a given sprint (or from doneCardIds of most recent closed sprint).
 * Returns: suggested version, versionType, and auto-generated changelog preview.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: boardId } = await params;
  const payload = await getAuthFromRequest(request);
  if (!payload) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const canAccess = await userCanAccessBoard(payload.id, payload.orgId, payload.isAdmin, boardId);
  if (!canAccess) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const org = await getOrganizationById(payload.orgId);
  try {
    assertFeatureAllowed(org, "sprint_engine", planGateCtxFromAuthPayload(payload));
  } catch {
    return NextResponse.json({ error: "Recurso disponível em planos pagos." }, { status: 403 });
  }

  const url = new URL(request.url);
  const sprintIdParam = url.searchParams.get("sprintId");

  const [board, sprints, releases] = await Promise.all([
    getBoard(boardId, payload.orgId),
    listSprints(payload.orgId, boardId),
    listReleases(payload.orgId, boardId),
  ]);

  const targetSprint = sprintIdParam
    ? sprints.find((s) => s.id === sprintIdParam) ?? null
    : sprints.find((s) => s.status === "review") ?? sprints.find((s) => s.status === "closed") ?? null;

  const cards = Array.isArray(board?.cards) ? (board!.cards as Record<string, unknown>[]) : [];
  const cardById = new Map<string, CardLike>();
  for (const c of cards) {
    if (c && typeof c === "object") {
      const id = String((c as { id?: string }).id ?? "");
      if (!id) continue;
      cardById.set(id, {
        id,
        title: String((c as { title?: string }).title ?? ""),
        type: String((c as { type?: string }).type ?? ""),
        priority: String((c as { priority?: string }).priority ?? ""),
        labels: Array.isArray((c as { labels?: unknown[] }).labels)
          ? ((c as { labels: unknown[] }).labels.filter((x) => typeof x === "string") as string[])
          : [],
        description: String((c as { description?: string }).description ?? ""),
      });
    }
  }

  const sourceCardIds = targetSprint
    ? [...targetSprint.doneCardIds, ...targetSprint.cardIds]
    : cards.map((c) => String((c as { id?: string }).id ?? "")).filter(Boolean).slice(0, 30);

  const dedupeIds = Array.from(new Set(sourceCardIds));
  const scopedCards: CardLike[] = dedupeIds.map((id) => cardById.get(id)).filter((x): x is CardLike => !!x);

  const changelog = buildChangelogFromCards(scopedCards);
  const versionType = suggestVersionType(changelog);
  const lastReleased = releases.find((r) => r.status === "released") ?? releases[0] ?? null;
  const previousVersion = lastReleased?.version ?? "0.1.0";
  const version = bumpSemver(previousVersion, versionType);

  return NextResponse.json({
    suggestion: {
      version,
      versionType,
      previousVersion,
      sprintId: targetSprint?.id ?? null,
      sprintName: targetSprint?.name ?? null,
      cardIds: dedupeIds,
      changelog,
    },
  });
}
