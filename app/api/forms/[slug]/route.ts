import { NextRequest, NextResponse } from "next/server";
import { getBoard, updateBoardFromExisting } from "@/lib/kv-boards";
import { getIntakeFormIndexBySlug } from "@/lib/kv-intake-forms";
import { IntakeSubmissionSchema, sanitizeDeep, zodErrorToMessage } from "@/lib/schemas";
import { classifyIntake, normalizeFormSlug } from "@/lib/forms-intake";
import { getClientIpFromHeaders, rateLimit } from "@/lib/rate-limit";

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
  order: number;
};

function safePublicForm(board: any) {
  const f = board?.intakeForm || {};
  return {
    enabled: Boolean(f.enabled ?? false),
    slug: String(f.slug || ""),
    title: String(f.title || "Flux Forms"),
    description: String(f.description || ""),
  };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const slug = normalizeFormSlug(rawSlug);
  if (!slug) return NextResponse.json({ error: "Slug inválido." }, { status: 400 });

  const index = await getIntakeFormIndexBySlug(slug);
  if (!index || !index.enabled) return NextResponse.json({ error: "Formulário não encontrado." }, { status: 404 });

  const board = await getBoard(index.boardId, index.orgId);
  if (!board || !(board as any).intakeForm?.enabled) {
    return NextResponse.json({ error: "Formulário indisponível." }, { status: 404 });
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
  if (!index || !index.enabled) return NextResponse.json({ error: "Formulário não encontrado." }, { status: 404 });

  const board = await getBoard(index.boardId, index.orgId);
  const form = (board as any)?.intakeForm;
  if (!board || !form?.enabled || normalizeFormSlug(String(form.slug || "")) !== slug) {
    return NextResponse.json({ error: "Formulário indisponível." }, { status: 404 });
  }

  try {
    const parsed = IntakeSubmissionSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: zodErrorToMessage(parsed.error) }, { status: 400 });
    const clean = sanitizeDeep(parsed.data);

    const classifier = classifyIntake({
      title: String(clean.title || ""),
      description: String(clean.description || ""),
    });

    const bucketList = Array.isArray((board as any).config?.bucketOrder) ? (board as any).config.bucketOrder : [];
    const availableBucketKeys = new Set<string>(bucketList.map((b: any) => String(b?.key || "")));
    const targetBucket = availableBucketKeys.has(classifier.bucketKey || "")
      ? String(classifier.bucketKey)
      : availableBucketKeys.has(String(form.targetBucketKey || ""))
        ? String(form.targetBucketKey)
        : String(bucketList[0]?.key || "Backlog");

    const existingCards = Array.isArray((board as any).cards) ? ((board as any).cards as BoardCard[]) : [];
    const order = existingCards.filter((c) => c.bucket === targetBucket).length;
    const mergedTags = new Set<string>([
      ...(Array.isArray(form.defaultTags) ? form.defaultTags : []),
      ...(Array.isArray(clean.tags) ? clean.tags : []),
      ...classifier.tags,
      "Flux Forms",
    ]);

    const card: BoardCard = {
      id: `FORM-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`.toUpperCase(),
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
      order,
    };

    await updateBoardFromExisting(board, { cards: [...existingCards, card] });

    return NextResponse.json({
      ok: true,
      cardId: card.id,
      bucket: card.bucket,
      priority: card.priority,
      tags: card.tags,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro interno" }, { status: 500 });
  }
}
