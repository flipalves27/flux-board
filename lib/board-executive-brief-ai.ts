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
