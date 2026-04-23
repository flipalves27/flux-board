import type { BoardMethodology } from "@/lib/board-methodology";
import { getMethodologyModule } from "@/lib/methodology-module";
import type { FlowInsightChipModel } from "@/lib/board-flow-insights";
import type { BoardPortfolioMetrics } from "@/lib/board-portfolio-metrics";

export function boardHealthBriefingSystemPrompt(methodology: BoardMethodology | undefined): string {
  const m = getMethodologyModule(methodology);
  const base = `És um assistente de gestão de trabalho. Respondes em português (pt-PT ou pt-BR) de forma curta e acionável.
Regras: baseia-te apenas no contexto de métricas fornecido; se faltar dado, diz que não é possível concluir; no máximo 5 frases curtas em markdown (títulos ## opcionais, bullets); sugere 1–3 ações concretas no fim.`;
  return `${base}\n\nContexto metodológico: ${m.copilotContextHint}`;
}

export function buildBoardHealthBriefingUserPrompt(input: {
  boardName: string;
  lastUpdated: string;
  cardCount: number;
  openCount: number;
  inProgressCount: number;
  portfolio: BoardPortfolioMetrics;
  chips: FlowInsightChipModel[];
}): string {
  const chipSummary = input.chips
    .map((c) => {
      const v = c.values ? JSON.stringify(c.values) : "";
      return `- ${c.kind} (${c.id}): ${c.cardIds.length} cards ${v}`.trim();
    })
    .join("\n");

  return `Board: ${input.boardName}
Atualizado: ${input.lastUpdated}
Cards: ${input.cardCount} (abertos estimados: ${input.openCount}, em andamento: ${input.inProgressCount})
Portfolio — risco: ${input.portfolio.risco ?? "n/d"}, fluxo/throughput: ${input.portfolio.throughput ?? "n/d"}
Chips de insights de fluxo:
${chipSummary || "(nenhum)"}

Gera um briefing curto: estado geral, um risco ou gargalo, uma oportunidade de melhoria, e 1–3 próximos passos.`;
}
