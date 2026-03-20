/** Parse JSON tolerante a cercas ```json do LLM */
export function safeJsonParse(raw: string): unknown | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  const unfenced = s.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  const first = unfenced.indexOf("{");
  const last = unfenced.lastIndexOf("}");
  const candidate = first >= 0 && last > first ? unfenced.slice(first, last + 1) : unfenced;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}
