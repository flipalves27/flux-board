import type { PortfolioRow } from "@/lib/portfolio-export-core";

const MAX_BOARDS = 24;

export type OkrRingSummary = { id: string; title: string; progressPct: number; quarter: string };

/**
 * Contexto compacto multi-board + OKRs para o assistente de portfólio (limites de tokens).
 */
export function buildOrgPortfolioContextText(opts: {
  orgName?: string;
  quarter: string;
  aggregates: {
    boardCount: number;
    boardsWithCards: number;
    avgRisco: number | null;
    avgThroughput: number | null;
    avgPrevisibilidade: number | null;
    atRiskCount: number;
  };
  okrs: { enabled: boolean; rings: OkrRingSummary[]; avgProgressPct: number | null };
  rows: PortfolioRow[];
}): string {
  const sorted = [...opts.rows]
    .filter((r) => r.portfolio.cardCount > 0)
    .sort((a, b) => (a.portfolio.risco ?? 100) - (b.portfolio.risco ?? 100))
    .slice(0, MAX_BOARDS);

  const boardLines = sorted.map((r) => {
    const p = r.portfolio;
    return `- ${r.name}${r.clientLabel ? ` (${r.clientLabel})` : ""}: cards=${p.cardCount}, risco=${p.risco ?? "—"}, throughput=${p.throughput ?? "—"}, previsibilidade=${p.previsibilidade ?? "—"}`;
  });

  const okrLines =
    opts.okrs.enabled && opts.okrs.rings.length > 0
      ? opts.okrs.rings
          .slice(0, 12)
          .map((o) => `- ${o.title}: ${o.progressPct}% (${o.quarter})`)
          .join("\n")
      : "(OKRs indisponíveis ou vazios neste trimestre)";

  return `Organização: ${opts.orgName ?? "—"}
Trimestre: ${opts.quarter}

## Agregados
- Boards: ${opts.aggregates.boardCount}, com cards: ${opts.aggregates.boardsWithCards}
- Risco médio: ${opts.aggregates.avgRisco ?? "—"}, Throughput médio: ${opts.aggregates.avgThroughput ?? "—"}, Previsibilidade média: ${opts.aggregates.avgPrevisibilidade ?? "—"}
- Boards em risco (índice < 48): ${opts.aggregates.atRiskCount}
- Progresso OKR médio: ${opts.okrs.avgProgressPct ?? "—"}%

## OKRs (objetivos)
${okrLines}

## Boards (até ${MAX_BOARDS}, piores riscos primeiro)
${boardLines.join("\n") || "(nenhum board com cards)"}
`.trim();
}

export function buildOrgPortfolioRagBlock(chunks: Array<{ docTitle: string; text: string }>): string {
  if (!chunks.length) return "";
  return chunks
    .slice(0, 8)
    .map((c, i) => `### Trecho doc ${i + 1}: ${c.docTitle}\n${c.text.slice(0, 1200)}`)
    .join("\n\n");
}
