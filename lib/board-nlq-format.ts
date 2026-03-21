export type NlqClientResponse =
  | {
      ok: true;
      resultType: "cards";
      cardIds: string[];
      rows: Array<{ id: string; title: string; priority: string; bucketLabel: string }>;
      explanation: string;
    }
  | {
      ok: true;
      resultType: "metric";
      primaryValue: number;
      compareValue: number | null;
      explanation: string;
      chart?: Array<{ label: string; value: number }>;
    }
  | { ok: false; fallbackMessage: string; suggestions: string[] };

export function formatNlqCopilotMessage(data: NlqClientResponse): string {
  if (!data.ok) {
    const sug = data.suggestions.length ? `\n\nExemplos: ${data.suggestions.slice(0, 4).join(" · ")}` : "";
    return `${data.fallbackMessage}${sug}`;
  }
  if (data.resultType === "metric") {
    const cmp =
      data.compareValue != null ? `\nComparado (semana anterior): **${data.compareValue}**` : "";
    return (
      `**Consulta estruturada (/query)**\n\n` +
      `**${data.primaryValue}** conclusões (via Copilot, período solicitado).${cmp}\n\n` +
      `${data.explanation}\n\n` +
      `_Gráfico no painel “Consulta inteligente” acima do board._`
    );
  }
  const lines = data.rows.slice(0, 25).map((r) => `• ${r.title} — ${r.priority} — ${r.bucketLabel}`);
  const more =
    data.rows.length > 25 ? `\n… e mais ${data.rows.length - 25} card(s).` : "";
  return (
    `**Consulta estruturada (/query)**\n\n` +
    `${data.explanation}\n\n` +
    `${lines.join("\n")}${more}\n\n` +
    `_O board foi filtrado para estes cards._`
  );
}
