/** Optional PII scrub before sending card/repo context to an LLM (org policy). */

export function redactForForge(input: string, pattern?: string | null): string {
  if (!pattern?.trim()) return input;
  try {
    const re = new RegExp(pattern, "gi");
    return input.replace(re, "[REDACTED]");
  } catch {
    return input;
  }
}
