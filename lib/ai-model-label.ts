/** Rótulo curto para exibição na UI (discreto). */
export function formatAiModelLabel(raw: string | null | undefined): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (lower === "heurístico local" || lower.includes("heuristic")) return "Heurístico local";

  const slash = s.lastIndexOf("/");
  const tail = slash >= 0 ? s.slice(slash + 1) : s;

  if (/^claude/i.test(tail)) {
    const m = tail.match(/claude[-\s]?([\d.]+)?[-\s]?(sonnet|opus|haiku)?/i);
    if (m) {
      const ver = m[1] || "";
      const tier = m[2] ? ` ${m[2][0]!.toUpperCase()}${m[2].slice(1).toLowerCase()}` : "";
      return `Claude${ver ? ` ${ver}` : ""}${tier}`.trim();
    }
    return tail.length > 42 ? `${tail.slice(0, 40)}…` : tail;
  }

  if (/llama|meta-llama/i.test(tail)) {
    const v = tail.match(/(\d+\.?\d*)/);
    return v ? `Llama ${v[1]}` : (tail.length > 36 ? `${tail.slice(0, 34)}…` : tail);
  }

  return tail.length > 48 ? `${tail.slice(0, 46)}…` : tail;
}
