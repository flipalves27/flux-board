import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { getBoard, userCanAccessBoard } from "@/lib/kv-boards";
import { getOrganizationById } from "@/lib/kv-organizations";
import { assertFeatureAllowed, planGateCtxFromAuthPayload } from "@/lib/plan-gates";
import { appendReleaseTimeline, getRelease, updateRelease } from "@/lib/kv-releases";
import {
  buildChangelogFromCards,
  computeHealthScore,
  generateMarkdownReleaseNotes,
  suggestVersionType,
  type CardLike,
} from "@/lib/release-ai";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; releaseId: string }> }
) {
  const { id: boardId, releaseId } = await params;
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

  const release = await getRelease(payload.orgId, releaseId);
  if (!release || release.boardId !== boardId) {
    return NextResponse.json({ error: "Release não encontrada" }, { status: 404 });
  }

  const board = await getBoard(boardId, payload.orgId);
  const cards = Array.isArray(board?.cards) ? (board!.cards as Record<string, unknown>[]) : [];
  const cardById = new Map<string, CardLike>();
  for (const c of cards) {
    if (c && typeof c === "object") {
      const id = String((c as { id?: string }).id ?? "");
      if (id) {
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
  }

  const scopedCards: CardLike[] = release.cardIds
    .map((id) => cardById.get(id))
    .filter((x): x is CardLike => !!x);

  const body = await request.json().catch(() => ({}));
  const locale = (body?.locale === "en" ? "en" : "pt-BR") as "pt-BR" | "en";
  const voice = (body?.voice === "marketing" || body?.voice === "technical"
    ? body.voice
    : "concise") as "concise" | "marketing" | "technical";

  const autoChangelog = buildChangelogFromCards(scopedCards);
  const changelog = release.changelog.length > 0 ? release.changelog : autoChangelog;

  const markdown = generateMarkdownReleaseNotes(
    {
      name: release.name,
      version: release.version,
      summary: release.summary,
      environment: release.environment,
      versionType: release.versionType,
      changelog,
      risks: release.risks,
    },
    { locale, voice, includeCardRefs: true }
  );

  const suggestedBump = suggestVersionType(changelog, { tags: release.tags });
  const healthScore = computeHealthScore({ changelog, risks: release.risks });

  await updateRelease(
    payload.orgId,
    releaseId,
    {
      aiNotes: markdown,
      healthScore,
      ...(release.changelog.length === 0 ? { changelog } : {}),
    },
    { actor: payload.id }
  );
  await appendReleaseTimeline(payload.orgId, releaseId, {
    kind: "ai_notes_generated",
    by: payload.id,
    note: `voice=${voice} locale=${locale}`,
  });

  return NextResponse.json({
    aiNotes: markdown,
    suggestedVersionType: suggestedBump,
    healthScore,
    changelog,
  });
}
