import "server-only";

import type { z } from "zod";
import { WorkItemsLlmSchema } from "@/lib/spec-plan-schemas";

type WorkItemsData = z.infer<typeof WorkItemsLlmSchema>;

const HARD_CAP = 36_000;

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * Reduz o JSON de work items no prompt de mapeamento → mais margem para a resposta JSON dos cards
 * e menos risco de truncar a saída no meio (erro "não é JSON válido").
 */
export function compactWorkItemsForCardsJson(data: WorkItemsData): string {
  // Start with tighter limits to keep the cards LLM input smaller,
  // which reduces output size and avoids JSON truncation mid-response.
  let maxItems = 35;
  let titleMax = 120;
  let descMax = 180;
  let summaryMax = 280;

  const build = (): WorkItemsData => ({
    methodologySummary: clip(data.methodologySummary || "", summaryMax),
    items: data.items.slice(0, maxItems).map((it) => ({
      id: clip(String(it.id), 40),
      title: clip(it.title, titleMax),
      description: clip(it.description, descMax),
      type: clip(it.type, 72),
      suggestedTags: (it.suggestedTags ?? []).slice(0, 8).map((t) => clip(String(t), 40)),
    })),
  });

  let json = JSON.stringify(build());
  while (json.length > HARD_CAP && maxItems > 18) {
    maxItems -= 4;
    titleMax = Math.max(80, titleMax - 20);
    descMax = Math.max(100, descMax - 30);
    summaryMax = Math.max(160, summaryMax - 30);
    json = JSON.stringify(build());
  }
  return json;
}

export function compactRemapWorkItemsJsonString(raw: string): string {
  if (raw.length < 28_000) return raw;
  try {
    const j = JSON.parse(raw) as unknown;
    const p = WorkItemsLlmSchema.safeParse(j);
    if (p.success) return compactWorkItemsForCardsJson(p.data);
  } catch {
    /* ignore */
  }
  return raw;
}
