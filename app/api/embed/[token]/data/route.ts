import { NextRequest, NextResponse } from "next/server";
import { getBoard } from "@/lib/kv-boards";
import { getEmbedByToken } from "@/lib/kv-embed";
import { getOrganizationById } from "@/lib/kv-organizations";
import { resolvePlatformDisplayName } from "@/lib/org-branding";
import { computeBoardPortfolio, type PortfolioBoardLike } from "@/lib/board-portfolio-metrics";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

function parseCards(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) return [];
  return raw.filter((c) => c && typeof c === "object") as Array<Record<string, unknown>>;
}

function isDone(c: Record<string, unknown>): boolean {
  return c.progress === "Concluída";
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Token inválido." }, { status: 400 });

  const rl = await rateLimit({
    key: `embed:data:${token.slice(0, 48)}`,
    limit: 100,
    windowMs: 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Muitas requisições para este embed." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const emb = await getEmbedByToken(token);
  if (!emb) return NextResponse.json({ error: "Widget não encontrado." }, { status: 404 });

  if (emb.expiresAt) {
    const ex = new Date(emb.expiresAt).getTime();
    if (Number.isFinite(ex) && ex < Date.now()) {
      return NextResponse.json({ error: "Link de embed expirado. Gere um novo na configuração do board." }, { status: 410 });
    }
  }

  const board = await getBoard(emb.boardId, emb.orgId);
  if (!board) return NextResponse.json({ error: "Board não encontrado." }, { status: 404 });

  const org = await getOrganizationById(emb.orgId);
  const platformName = resolvePlatformDisplayName(org?.branding, org?.name);
  const brandLogo = org?.branding?.logoUrl?.trim();

  const cards = parseCards(board.cards);
  const total = cards.length;
  const done = cards.filter(isDone).length;
  const inProgress = total - done;

  const buckets = Array.isArray(board.config?.bucketOrder)
    ? (board.config!.bucketOrder as Array<{ key?: string; label?: string }>)
    : [];

  const byBucket: Record<string, number> = {};
  for (const c of cards) {
    const k = typeof c.bucket === "string" ? c.bucket : "—";
    byBucket[k] = (byBucket[k] ?? 0) + 1;
  }

  const portfolio = computeBoardPortfolio(board as PortfolioBoardLike);

  let overdue = 0;
  for (const c of cards) {
    if (isDone(c)) continue;
    const d = c.dueDate;
    if (typeof d === "string" && d) {
      const due = new Date(`${d.trim()}T00:00:00`);
      if (!Number.isNaN(due.getTime()) && due.getTime() < Date.now()) overdue++;
    }
  }

  const miniKanban = buckets.slice(0, 12).map((b) => {
    const key = String(b.key || "");
    const inCol = cards.filter((c) => c.bucket === key && !isDone(c)).slice(0, 8);
    return {
      key,
      label: String(b.label || key),
      cards: inCol.map((c) => ({
        title: typeof c.title === "string" ? c.title.slice(0, 120) : "—",
        progress: typeof c.progress === "string" ? c.progress : "",
      })),
    };
  });

  const heatmap = buckets.map((b, i) => ({
    column: String(b.label || b.key || `c${i}`),
    intensity: Math.min(100, ((byBucket[String(b.key)] ?? 0) / Math.max(total, 1)) * 100),
  }));

  return NextResponse.json({
    updatedAt: board.lastUpdated ?? new Date().toISOString(),
    boardName: board.name,
    clientLabel: board.clientLabel,
    platformName,
    logoUrl: brandLogo,
    kind: emb.kind,
    badge: {
      total,
      inProgress,
      done,
      overdue,
    },
    portfolio,
    miniKanban,
    heatmap,
    okr: {
      message: "OKRs integrados ao board em breve.",
      bars: [] as Array<{ label: string; percent: number }>,
    },
  });
}
