import { SPEC_PLAN_MAX_TEXT_CHARS } from "@/lib/spec-plan-constants";

export function normalizeSpecDocumentText(raw: string): string {
  return String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function truncateSpecText(text: string, maxChars: number = SPEC_PLAN_MAX_TEXT_CHARS): { text: string; truncated: boolean } {
  const t = normalizeSpecDocumentText(text);
  if (t.length <= maxChars) return { text: t, truncated: false };
  return { text: t.slice(0, maxChars) + "\n\n[... conteúdo truncado por limite ...]", truncated: true };
}
