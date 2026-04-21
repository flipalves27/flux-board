import { sanitizeText } from "@/lib/schemas";

export type DecomposeSubtaskDraft = {
  title: string;
  priority: "low" | "medium" | "high";
  estimateHours: number | null;
  status: "pending";
  order: number;
};

/**
 * Extrai JSON de subtasks a partir da resposta do modelo (regressão sem chamar LLM).
 */
export function parseDecomposeSubtasksFromAssistant(assistantText: string): DecomposeSubtaskDraft[] {
  const jsonMatch = assistantText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];
  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      subtasks?: Array<{ title: string; priority?: string; estimateHours?: number | null }>;
    };
    return (parsed.subtasks ?? [])
      .slice(0, 8)
      .map((s, i) => ({
        title: sanitizeText(String(s.title ?? "")).trim().slice(0, 300),
        priority: (["low", "medium", "high"].includes(String(s.priority ?? ""))
          ? (s.priority as "low" | "medium" | "high")
          : "medium") as "low" | "medium" | "high",
        estimateHours: typeof s.estimateHours === "number" ? s.estimateHours : null,
        status: "pending" as const,
        order: i,
      }))
      .filter((s) => s.title.length > 0);
  } catch {
    return [];
  }
}
