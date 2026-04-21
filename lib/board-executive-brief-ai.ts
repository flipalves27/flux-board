export type ExecutiveBriefCardSlice = {
  title: string;
  bucket: string;
  priority: string;
  progress: string;
  order?: number;
};

export function buildExecutiveBriefAiUserPrompt(board: { name: string; cards: ExecutiveBriefCardSlice[] }): string {
  const sorted = [...board.cards].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const lines = sorted.slice(0, 150).map(
    (c) => `- [${c.bucket}] ${c.title} (${c.priority}, ${c.progress})`
  );
  return `Board: ${board.name}
Total de cards: ${board.cards.length}
Lista (até 150):
${lines.join("\n")}

Gere um resumo executivo em markdown (pt-BR): visão geral, riscos ou gargalos, próximos passos sugeridos. Máximo ~400 palavras. Tom profissional e objetivo.`;
}

/** Brief curto ao abrir o board (Onda 4 — Daily Flow Briefing). */
export function buildDailyArrivalBriefPrompt(board: { name: string; cards: ExecutiveBriefCardSlice[] }): string {
  const sorted = [...board.cards].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const lines = sorted.slice(0, 80).map((c) => `- [${c.bucket}] ${c.title} (${c.priority})`);
  return `Board: ${board.name}
Cards (até 80):
${lines.join("\n")}

Gere um briefing diário curto em markdown (pt-BR): 3 bullets do que mudou ou merece atenção hoje, 1 risco, 1 próximo passo. Máximo ~180 palavras. Tom direto.`;
}
