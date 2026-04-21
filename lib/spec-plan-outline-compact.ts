import "server-only";

import type { z } from "zod";
import { OutlineLlmSchema } from "@/lib/spec-plan-schemas";

type OutlineData = z.infer<typeof OutlineLlmSchema>;

/** Evita prompts enormes na fase de itens de trabalho (PDF → outline verboso). */
const HARD_CAP_CHARS = 48_000;

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

export function compactOutlineForWorkItemsJson(outline: OutlineData): string {
  let maxSec = 32;
  let maxSub = 10;
  let secSum = 520;
  let subSum = 360;
  let krLimit = 50;
  let krText = 400;

  const build = (): OutlineData => ({
    sections: outline.sections.slice(0, maxSec).map((s) => ({
      title: clip(s.title, 200),
      summary: clip(s.summary, secSum),
      subsections: (s.subsections ?? []).slice(0, maxSub).map((sub) => ({
        title: clip(sub.title, 180),
        summary: clip(sub.summary, subSum),
      })),
    })),
    keyRequirements: outline.keyRequirements.slice(0, krLimit).map((k) => ({
      id: clip(String(k.id), 48),
      text: clip(k.text, krText),
    })),
  });

  let json = JSON.stringify(build());
  while (json.length > HARD_CAP_CHARS && (secSum > 180 || maxSec > 12)) {
    secSum = Math.max(180, secSum - 100);
    subSum = Math.max(120, subSum - 80);
    maxSec = Math.max(12, maxSec - 4);
    maxSub = Math.max(4, maxSub - 2);
    krLimit = Math.max(28, krLimit - 6);
    krText = Math.max(200, krText - 80);
    json = JSON.stringify(build());
  }
  return json;
}
