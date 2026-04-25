import type { BoardPortfolioMetrics } from "@/lib/board-portfolio-metrics";

export type ExecutiveOnePagerTopCard = {
  title: string;
  bucket: string;
  priority: string;
  progress: string;
  justification?: string;
};

/** Markdown único para envio pré-reunião (imprimir para PDF ou anexar .md). */
export function buildExecutiveOnePagerMarkdown(input: {
  boardName: string;
  productGoal?: string;
  executiveStakeholderNote?: string;
  lastUpdatedLabel: string;
  portfolio: BoardPortfolioMetrics;
  topDecisions: ExecutiveOnePagerTopCard[];
  executiveBriefMarkdown?: string | null;
}): string {
  const lines: string[] = [];
  lines.push(`# One-pager executivo — ${input.boardName}`);
  lines.push("");
  lines.push(`*Atualizado: ${input.lastUpdatedLabel}*`);
  lines.push("");
  if (input.productGoal?.trim()) {
    lines.push("## Objetivo");
    lines.push(input.productGoal.trim());
    lines.push("");
  }
  if (input.executiveStakeholderNote?.trim()) {
    lines.push("## Nota do PO / stakeholders");
    lines.push(input.executiveStakeholderNote.trim());
    lines.push("");
  }
  lines.push("## Indicadores");
  lines.push(
    `- Risco (índice composto): ${input.portfolio.risco ?? "—"}`,
    `- Capacidade / momentum: ${input.portfolio.throughput ?? "—"}`,
    `- Previsibilidade: ${input.portfolio.previsibilidade ?? "—"}`
  );
  lines.push("");
  lines.push("## Top decisões");
  if (input.topDecisions.length === 0) {
    lines.push("_Sem itens abertos no critério atual._");
  } else {
    for (let i = 0; i < input.topDecisions.length; i++) {
      const c = input.topDecisions[i]!;
      lines.push(`### ${i + 1}. ${c.title}`);
      lines.push(`- Coluna: ${c.bucket} · Prioridade: ${c.priority} · Estado: ${c.progress}`);
      if (c.justification?.trim()) lines.push(`- *Comité:* ${c.justification.trim()}`);
      lines.push("");
    }
  }
  if (input.executiveBriefMarkdown?.trim()) {
    lines.push("## Brief de IA");
    lines.push(input.executiveBriefMarkdown.trim());
    lines.push("");
  }
  return lines.join("\n").trim() + "\n";
}
