import {
  averageNullable,
  computeBoardPortfolio,
  type PortfolioBoardLike,
} from "@/lib/board-portfolio-metrics";
import type { BoardData } from "@/lib/kv-boards";

export type PortfolioRow = {
  id: string;
  name: string;
  ownerId: string;
  clientLabel?: string;
  lastUpdated?: string;
  portfolio: ReturnType<typeof computeBoardPortfolio>;
};

export function boardsToPortfolioRows(boards: BoardData[]): PortfolioRow[] {
  return boards.map((b) => ({
    id: b.id,
    name: b.name,
    ownerId: b.ownerId,
    clientLabel: typeof b.clientLabel === "string" ? b.clientLabel : undefined,
    lastUpdated: b.lastUpdated,
    portfolio: computeBoardPortfolio(b as PortfolioBoardLike),
  }));
}

export function aggregatePortfolio(rows: PortfolioRow[]) {
  const withCards = rows.filter((r) => r.portfolio.cardCount > 0);
  return {
    boardCount: rows.length,
    boardsWithCards: withCards.length,
    avgRisco: averageNullable(withCards.map((r) => r.portfolio.risco)),
    avgThroughput: averageNullable(withCards.map((r) => r.portfolio.throughput)),
    avgPrevisibilidade: averageNullable(withCards.map((r) => r.portfolio.previsibilidade)),
    atRiskCount: withCards.filter((r) => (r.portfolio.risco ?? 100) < 48).length,
  };
}

export function buildExecutiveBriefMarkdown(opts: {
  userLabel: string;
  generatedAt: string;
  rows: PortfolioRow[];
}): string {
  const { userLabel, generatedAt, rows } = opts;
  const agg = aggregatePortfolio(rows);
  const sortedByRisk = [...rows].sort((a, b) => {
    const ar = a.portfolio.risco ?? 999;
    const br = b.portfolio.risco ?? 999;
    return ar - br;
  });

  const lines: string[] = [
    `# Brief executivo — Flux-Board`,
    ``,
    `- **Gerado em:** ${generatedAt}`,
    `- **Usuário / contexto:** ${userLabel}`,
    ``,
    `## Resumo do portfólio`,
    ``,
    `| Métrica | Valor |`,
    `|---------|-------|`,
    `| Boards | ${agg.boardCount} |`,
    `| Com itens no quadro | ${agg.boardsWithCards} |`,
    `| Risco (média) | ${agg.avgRisco ?? "—"} |`,
    `| Throughput (média) | ${agg.avgThroughput ?? "—"} |`,
    `| Previsibilidade (média) | ${agg.avgPrevisibilidade ?? "—"} |`,
    `| Boards com risco abaixo de 48 | ${agg.atRiskCount} |`,
    ``,
    `## Boards ordenados por risco (menor primeiro)`,
    ``,
    `| Board | Cliente / conta | Cards | Risco | Throughput | Previsibilidade |`,
    `|-------|-----------------|-------|-------|------------|-----------------|`,
  ];

  for (const r of sortedByRisk) {
    const p = r.portfolio;
    const client = (r.clientLabel || "—").replace(/\|/g, "/");
    const name = r.name.replace(/\|/g, "/");
    lines.push(
      `| ${name} | ${client} | ${p.cardCount} | ${p.risco ?? "—"} | ${p.throughput ?? "—"} | ${p.previsibilidade ?? "—"} |`
    );
  }

  lines.push(
    ``,
    `---`,
    ``,
    `_Documento gerado automaticamente a partir dos índices heurísticos do Flux-Board. Ideal para anexos em comitês, steering ou propostas comerciais._`,
    ``
  );

  return lines.join("\n");
}
