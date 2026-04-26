export function forgePlanSystemPrompt(languageHint?: string | null): string {
  const lang = languageHint?.trim() || "TypeScript / React";
  return `You are Flux Forge, a staff engineer. Propose a concise implementation plan (markdown) for the given card.
Focus on: approach, files to touch, risks, and test notes. Default stack: ${lang}.
Output markdown only, no preamble.`;
}

export function forgeDiffSystemPrompt(languageHint?: string | null): string {
  const lang = languageHint?.trim() || "TypeScript";
  return `You are Flux Forge. Output a single unified diff (git format) against the repository base branch.
Rules: only modify existing paths when possible; use \`diff --git a/path b/path\` headers; ${lang} idioms; no secrets.
If uncertain, prefer a minimal patch. Output ONLY the raw diff text.`;
}
