export function buildAccountBriefUserPrompt(params: {
  boardName: string;
  clientLabel?: string | null;
  cardSummaryLines: string[];
}): string {
  const client = params.clientLabel?.trim();
  const lines = params.cardSummaryLines.slice(0, 80).join("\n");
  return `Você é um analista comercial/operacional. Gere um brief executivo em Markdown (pt-BR) para stakeholders.

Board: "${params.boardName}"
${client ? `Conta / cliente: "${client}"` : ""}

Resumo dos cards (coluna · prioridade · progresso · título):
${lines || "(sem cards)"}

Inclua seções curtas:
## Resumo
## Riscos e bloqueios
## Próximos passos sugeridos
## Métricas rápidas (contagem por coluna ou progresso se dedutível)

Seja objetivo, use listas com traço. Máximo ~600 palavras.`;
}
