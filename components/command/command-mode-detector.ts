export type CommandSurfaceMode = "search" | "ask" | "action";

const ASK_PREFIXES = ["/", "?", "fluxy", "fluxy:", "ask", "pergunta", "question"];

/**
 * Lightweight mode hint for the unified command shell (navigation vs copilot vs power actions).
 */
export function detectCommandSurfaceMode(input: string): CommandSurfaceMode {
  const q = input.trim().toLowerCase();
  if (!q) return "search";
  if (ASK_PREFIXES.some((p) => q.startsWith(p))) return "ask";
  if (q.startsWith(">") || q.startsWith("!") || q.startsWith("@")) return "action";
  return "search";
}
