import { NextRequest, NextResponse } from "next/server";
import { getBoard, updateBoardFromExisting } from "@/lib/kv-boards";
import { runFormSubmissionAutomations } from "@/lib/automation-engine";
import { getIntakeFormIndexBySlug } from "@/lib/kv-intake-forms";
import { getOrganizationById } from "@/lib/kv-organizations";
import {
  getDailyAiCallsCap,
  getDailyAiCallsWindowMs,
  makeDailyAiCallsRateLimitKey,
} from "@/lib/plan-gates";
import { IntakeSubmissionSchema, sanitizeDeep, zodErrorToMessage } from "@/lib/schemas";
import { classifyIntakeWithBoardContext, normalizeFormSlug } from "@/lib/forms-intake";
import { getClientIpFromHeaders, rateLimit } from "@/lib/rate-limit";
import { enqueueWebhookDeliveriesForEvent } from "@/lib/webhook-delivery";
import { nextBoardCardId } from "@/lib/card-id";

type BoardCard = {
  id: string;
  bucket: string;
  priority: string;
  progress: string;
  title: string;
  desc: string;
  tags: string[];
  direction: string | null;
  dueDate: string | null;
  assigneeId?: string | null;
  order: number;
};

function priorityRank(p: string): number {
  if (p === "Urgente") return 3;
  if (p === "Importante") return 2;
  if (p === "Média") return 1;
  return 0;
}

function safePublicForm(board: any) {
  const f = board?.intakeForm || {};
  return {
    enabled: Boolean(f.enabled ?? false),
    slug: String(f.slug || ""),
    title: String(f.title || "Flux Forms"),
    description: String(f.description || ""),
  };
}

const FORM_NOT_FOUND_MSG = "Formulário não encontrado.";

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const slug = normalizeFormSlug(rawSlug);
  if (!slug) return NextResponse.json({ error: "Slug inválido." }, { status: 400 });

  const ip = getClientIpFromHeaders(request.headers);
  const rlGet = await rateLimit({ key: `forms:get:${slug}:${ip}`, limit: 60, windowMs: 60_000 });
  if (!rlGet.allowed) {
    return NextResponse.json(
      { error: "Muitas requisições. Tente novamente em instantes." },
      { status: 429, headers: { "Retry-After": String(rlGet.retryAfterSeconds) } }
    );
  }

  const index = await getIntakeFormIndexBySlug(slug);
  if (!index || !index.enabled) return NextResponse.json({ error: FORM_NOT_FOUND_MSG }, { status: 404 });

  const board = await getBoard(index.boardId, index.orgId);
  if (!board || !(board as any).intakeForm?.enabled) {
    return NextResponse.json({ error: FORM_NOT_FOUND_MSG }, { status: 404 });
  }

  return NextResponse.json({ form: safePublicForm(board) });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const slug = normalizeFormSlug(rawSlug);
  if (!slug) return NextResponse.json({ error: "Slug inválido." }, { status: 400 });

  const ip = getClientIpFromHeaders(request.headers);
  const rl = await rateLimit({ key: `forms:submit:${slug}:${ip}`, limit: 20, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Tente novamente em instantes." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const index = await getIntakeFormIndexBySlug(slug);
  if (!index || !index.enabled) return NextResponse.json({ error: FORM_NOT_FOUND_MSG }, { status: 404 });

  const board = await getBoard(index.boardId, index.orgId);
  const form = (board as any)?.intakeForm;
  if (!board || !form?.enabled || normalizeFormSlug(String(form.slug || "")) !== slug) {
    return NextResponse.json({ error: FORM_NOT_FOUND_MSG }, { status: 404 });
  }

  try {
    const parsed = IntakeSubmissionSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
    const clean = sanitizeDeep(parsed.data);

    const org = await getOrganizationById(index.orgId);
    const cap = getDailyAiCallsCap(org);
    const togetherEnabled = Boolean(process.env.TOGETHER_API_KEY) && Boolean(process.env.TOGETHER_MODEL);
    let allowLlm = true;
    if (cap !== null && togetherEnabled) {
      const rlDaily = await rateLimit({
        key: makeDailyAiCallsRateLimitKey(index.orgId),
        limit: cap,
        windowMs: getDailyAiCallsWindowMs(),
      });
      allowLlm = rlDaily.allowed;
    }

    const classifier = await classifyIntakeWithBoardContext({
      board,
      formDefaultTags: Array.isArray(form.defaultTags) ? form.defaultTags : [],
      input: {
        title: String(clean.title || ""),
        description: String(clean.description || ""),
      },
      allowLlm,
    });

    const bucketList = Array.isArray((board as any).config?.bucketOrder) ? (board as any).config.bucketOrder : [];
    const availableBucketKeys = new Set<string>(bucketList.map((b: any) => String(b?.key || "")));
    const targetBucket = availableBucketKeys.has(classifier.bucketKey || "")
      ? String(classifier.bucketKey)
      : availableBucketKeys.has(String(form.targetBucketKey || ""))
        ? String(form.targetBucketKey)
        : String(bucketList[0]?.key || "Backlog");

    const existingCards = Array.isArray((board as any).cards) ? ((board as any).cards as BoardCard[]) : [];
    const mergedTags = new Set<string>([
      ...(Array.isArray(form.defaultTags) ? form.defaultTags : []),
      ...(Array.isArray(clean.tags) ? clean.tags : []),
      ...classifier.tags,
      "Flux Forms",
    ]);

    const duplicateId = classifier.duplicateOfCardId || null;
    if (duplicateId) {
      const dupIdx = existingCards.findIndex((c) => c.id === duplicateId);
      if (dupIdx >= 0) {
        const existing = existingCards[dupIdx];
        const appendBlock = [
          "",
          "---",
          `[Atualização via Flux Forms — ${new Date().toISOString()}]`,
          classifier.duplicateMergeSuggestion
            ? `Detecção de possível duplicata: ${classifier.duplicateMergeSuggestion}`
            : "Detecção de possível duplicata (IA).",
          "",
          `Título: ${String(clean.title || "").trim()}`,
          String(clean.description || "").trim(),
          `Solicitante: ${String(clean.requesterName || "").trim()}`,
          clean.requesterEmail ? `Contato: ${String(clean.requesterEmail).trim()}` : "",
          `Classificação (IA): ${classifier.rationale}`,
        ]
          .filter(Boolean)
          .join("\n");

        const nextPriority =
          classifier.priority && priorityRank(classifier.priority) > priorityRank(String(existing.priority || ""))
            ? classifier.priority
            : existing.priority;

        const updated: BoardCard = {
          ...existing,
          desc: `${String(existing.desc || "").trim()}\n${appendBlock}`.trim(),
          tags: [...mergedTags].map((t) => String(t).trim()).filter(Boolean).slice(0, 20),
          priority: String(nextPriority || form.defaultPriority || "Média"),
        };

        const nextCards = [...existingCards];
        nextCards[dupIdx] = updated;
        await updateBoardFromExisting(board, { cards: nextCards }, {
          userId: "__flux_forms__",
          userName: `${String(clean.requesterName || "").trim().slice(0, 80) || "Flux Forms"} (formulário)`,
          orgId: index.orgId,
        });

        const freshBoard = await getBoard(index.boardId, index.orgId);
        if (freshBoard) {
          await runFormSubmissionAutomations({ board: freshBoard, cardId: updated.id });
        }

        void enqueueWebhookDeliveriesForEvent(index.orgId, "form.submitted", {
          form_slug: slug,
          board_id: index.boardId,
          card_id: updated.id,
          merged: true,
          requester_name: String(clean.requesterName || "").trim(),
          requester_email: clean.requesterEmail ? String(clean.requesterEmail).trim() : null,
        });

        return NextResponse.json({
          ok: true,
          merged: true,
          cardId: updated.id,
          bucket: updated.bucket,
          priority: updated.priority,
          tags: updated.tags,
          classification: {
            usedLlm: classifier.usedLlm ?? false,
            rationale: classifier.rationale,
            ...(classifier.llmModel ? { llmModel: classifier.llmModel, llmProvider: classifier.llmProvider } : {}),
          },
        });
      }
    }

    const order = existingCards.filter((c) => c.bucket === targetBucket).length;
    const card: BoardCard = {
      id: nextBoardCardId(existingCards.map((c) => c.id)),
      bucket: targetBucket,
      priority: classifier.priority || String(form.defaultPriority || "Média"),
      progress: String(form.defaultProgress || "Não iniciado"),
      title: String(clean.title || "").trim(),
      desc: [
        String(clean.description || "").trim(),
        "",
        "---",
        `Solicitante: ${String(clean.requesterName || "").trim()}`,
        clean.requesterEmail ? `Contato: ${String(clean.requesterEmail).trim()}` : "",
        `Canal: Flux Forms`,
        `Classificação: ${classifier.rationale}`,
      ]
        .filter(Boolean)
        .join("\n"),
      tags: [...mergedTags].map((t) => String(t).trim()).filter(Boolean).slice(0, 20),
      direction: null,
      dueDate: null,
      assigneeId: (board as any).config?.cardRules?.requireAssignee ? String((board as any).ownerId || "") : null,
      order,
    };

    await updateBoardFromExisting(board, { cards: [...existingCards, card] }, {
      userId: "__flux_forms__",
      userName: `${String(clean.requesterName || "").trim().slice(0, 80) || "Flux Forms"} (formulário)`,
      orgId: index.orgId,
    });

    const freshBoard = await getBoard(index.boardId, index.orgId);
    if (freshBoard) {
      await runFormSubmissionAutomations({ board: freshBoard, cardId: card.id });
    }

    void enqueueWebhookDeliveriesForEvent(index.orgId, "form.submitted", {
      form_slug: slug,
      board_id: index.boardId,
      card_id: card.id,
      merged: false,
      requester_name: String(clean.requesterName || "").trim(),
      requester_email: clean.requesterEmail ? String(clean.requesterEmail).trim() : null,
    });

    return NextResponse.json({
      ok: true,
      merged: false,
      cardId: card.id,
      bucket: card.bucket,
      priority: card.priority,
      tags: card.tags,
      classification: {
        usedLlm: classifier.usedLlm ?? false,
        rationale: classifier.rationale,
        ...(classifier.llmModel ? { llmModel: classifier.llmModel, llmProvider: classifier.llmProvider } : {}),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro interno" }, { status: 500 });
  }
}
