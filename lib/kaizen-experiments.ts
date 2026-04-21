/** Modelo mínimo para experimentos Kaizen / melhoria contínua (cards ou tags). */

export type KaizenExperiment = {
  id: string;
  hypothesis: string;
  metric: string;
  boardId: string;
  createdAt: string;
  status: "draft" | "running" | "completed";
};

export function draftKaizenFromRetroInsight(insight: string, boardId: string): KaizenExperiment {
  const now = new Date().toISOString();
  return {
    id: `kz_${Date.now().toString(36)}`,
    hypothesis: insight.trim().slice(0, 240),
    metric: "throughput_or_lead_time",
    boardId,
    createdAt: now,
    status: "draft",
  };
}
