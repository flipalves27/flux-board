import "server-only";

import type { BoardData } from "@/app/board/[id]/page";
import { normalizeBoardForPersist } from "@/lib/board-persist-normalize";
import { nextBoardCardId } from "@/lib/card-id";
import {
  bucketOrderKeys,
  cardsSortedByBucket,
  firstBucketKey,
  resolveBucketKeyFromBoard,
} from "@/lib/spec-plan-resolve-bucket";
import { STORY_POINTS_FIBONACCI, type SubtaskData } from "@/lib/schemas";
import type { z } from "zod";
import { SpecPlanApplyCardSchema } from "@/lib/spec-plan-schemas";

type ApplyCard = z.infer<typeof SpecPlanApplyCardSchema>;

const PRIOS = ["Urgente", "Importante", "Média"] as const;
const PROGRESSES = ["Não iniciado", "Em andamento", "Concluída"] as const;

function priorityNorm(s: string): (typeof PRIOS)[number] {
  const t = String(s || "").trim();
  if ((PRIOS as readonly string[]).includes(t)) return t as (typeof PRIOS)[number];
  return "Média";
}

function progressNorm(s: string): (typeof PROGRESSES)[number] {
  const t = String(s || "").trim();
  if ((PROGRESSES as readonly string[]).includes(t)) return t as (typeof PROGRESSES)[number];
  return "Não iniciado";
}

function storyPointsNorm(n: number | null | undefined): number | undefined {
  if (n == null || !Number.isFinite(n)) return undefined;
  const x = Math.floor(Number(n));
  if ((STORY_POINTS_FIBONACCI as readonly number[]).includes(x)) return x;
  return undefined;
}

function buildSubtasksForCard(cardId: string, drafts: { title: string }[]): SubtaskData[] {
  const now = new Date().toISOString();
  return drafts.slice(0, 8).map((d, i) => ({
    id: `${cardId}-st${String(i + 1).padStart(2, "0")}`,
    title: String(d.title || "").trim().slice(0, 300) || `Subtarefa ${i + 1}`,
    status: "pending" as const,
    assigneeId: null,
    dueDate: null,
    priority: "medium" as const,
    order: i,
    estimateHours: null,
    completedAt: null,
    createdAt: now,
    parentSubtaskId: null,
  }));
}

function normalizeTitleKey(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Anexa cards gerados ao board e retorna o próximo estado normalizado.
 */
export function appendSpecPlanCardsToBoard(input: {
  board: BoardData;
  drafts: ApplyCard[];
  includeSubtasks: boolean;
}): BoardData {
  const board = input.board;
  const existing = Array.isArray(board.cards) ? [...board.cards] : [];
  const idsSoFar = existing.map((c) => String((c as { id?: string }).id || ""));
  const keys = bucketOrderKeys(board);
  const fallback = firstBucketKey(board) || "Backlog";

  type Built = {
    id: string;
    title: string;
    bucket: string;
    priority: string;
    progress: string;
    desc: string;
    tags: string[];
    order: number;
    storyPoints?: number;
    serviceClass?: string;
    subtasks?: SubtaskData[];
    blockedBy?: string[];
  };

  const built: Built[] = [];

  for (const d of input.drafts) {
    const id = nextBoardCardId(idsSoFar);
    idsSoFar.push(id);

    let bucket =
      resolveBucketKeyFromBoard(board, d.bucketKey, d.bucketKey) ||
      resolveBucketKeyFromBoard(board, undefined, d.bucketKey) ||
      fallback;

    const tags = (d.tags || []).map((t) => String(t).trim()).filter(Boolean).slice(0, 30);

    const row: Built = {
      id,
      title: String(d.title || "").trim().slice(0, 300) || "—",
      bucket,
      priority: priorityNorm(d.priority),
      progress: progressNorm(d.progress),
      desc: String(d.desc || "").slice(0, 6000),
      tags,
      order: 0,
    };

    const sp = storyPointsNorm(d.storyPoints ?? null);
    if (sp !== undefined) row.storyPoints = sp;

    if (d.serviceClass === "expedite" || d.serviceClass === "fixed_date" || d.serviceClass === "standard" || d.serviceClass === "intangible") {
      row.serviceClass = d.serviceClass;
    }

    if (input.includeSubtasks && Array.isArray(d.subtasks) && d.subtasks.length > 0) {
      row.subtasks = buildSubtasksForCard(
        id,
        d.subtasks.map((s) => ({ title: s.title }))
      );
    }

    built.push(row);
  }

  const titleToId = new Map<string, string>();
  for (const b of built) {
    titleToId.set(normalizeTitleKey(b.title), b.id);
  }

  for (let i = 0; i < built.length; i++) {
    const d = input.drafts[i];
    const b = built[i];
    const bb = (d.blockedByTitles || [])
      .map((t) => titleToId.get(normalizeTitleKey(t)))
      .filter((x): x is string => Boolean(x))
      .filter((id) => id !== b.id);
    if (bb.length) b.blockedBy = [...new Set(bb)].slice(0, 50);
  }

  const maxOrderByBucket = new Map<string, number>();
  for (const c of existing) {
    const bk = String((c as { bucket?: string }).bucket || "");
    const o = Number((c as { order?: number }).order);
    const cur = maxOrderByBucket.get(bk) ?? -1;
    if (Number.isFinite(o)) maxOrderByBucket.set(bk, Math.max(cur, o));
    else maxOrderByBucket.set(bk, cur);
  }

  for (const b of built) {
    const cur = maxOrderByBucket.get(b.bucket) ?? -1;
    const next = cur + 1;
    maxOrderByBucket.set(b.bucket, next);
    b.order = next;
  }

  const merged = [...existing, ...built] as BoardData["cards"];
  const sorted = cardsSortedByBucket(merged as { bucket?: string; order?: number }[], keys) as BoardData["cards"];

  const nextBoard: BoardData = { ...(board as BoardData), cards: sorted };
  return normalizeBoardForPersist(nextBoard);
}
