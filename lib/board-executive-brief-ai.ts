export type ExecutiveBriefCardSlice = {
  id?: string;
  title: string;
  bucket: string;
  priority: string;
  progress: string;
  order?: number;
  dueDate?: string | null;
  direction?: string | null;
  blockedByCount?: number;
};

function daysUntilDue(due: string | null | undefined): number | null {
  if (!due || typeof due !== "string") return null;
  const d = new Date(`${due.trim()}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / 86400000);
}

export function cardDataToExecutiveBriefSlices(cards: unknown[]): ExecutiveBriefCardSlice[] {
  if (!Array.isArray(cards)) return [];
  return cards.map((raw, i) => {
    const c = raw as Record<string, unknown>;
    const blockedBy = Array.isArray(c.blockedBy) ? c.blockedBy.filter((x) => typeof x === "string" && String(x).trim()) : [];
    return {
      id: typeof c.id === "string" ? c.id : undefined,
      title: typeof c.title === "string" && c.title.trim() ? c.title.trim() : "(sem título)",
      bucket: typeof c.bucket === "string" ? c.bucket : "",
      priority: typeof c.priority === "string" ? c.priority : "",
      progress: typeof c.progress === "string" ? c.progress : "",
      order: typeof c.order === "number" ? c.order : i,
      dueDate: c.dueDate == null || c.dueDate === "" ? null : String(c.dueDate),
      direction: c.direction == null || c.direction === "" ? null : String(c.direction),
      blockedByCount: blockedBy.length,
    };
  });
}

function formatCardLine(c: ExecutiveBriefCardSlice): string {
  const due =
    c.dueDate == null
      ? "sem data"
      : (() => {
          const d = daysUntilDue(c.dueDate);
          if (d === null) return `due:${c.dueDate}`;
          if (d < 0) return `atraso ${-d}d`;
          if (d === 0) return "hoje";
          return `due em ${d}d`;
        })();
  const dir = c.direction?.trim() ? `dir:${c.direction}` : "dir:-";
  const blk =
    (c.blockedByCount ?? 0) > 0 ? `deps_internas:${c.blockedByCount}` : "deps_internas:0";
  const id = c.id ? `id=${c.id} ` : "";
  return `- ${id}[${c.bucket}] ${c.title} (${c.priority}, ${c.progress}, ${due}, ${dir}, ${blk})`;
}

export function buildExecutiveBriefAiUserPrompt(board: { name: string; cards: ExecutiveBriefCardSlice[] }): string {
  const sorted = [...board.cards].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const lines = sorted.slice(0, 150).map((c) => formatCardLine(c));
  return `Board: ${board.name}
Total de cards: ${board.cards.length}
Lista (até 150) — cada linha inclui prazo relativo, direção estratégica (quando existir) e contagem de dependências internas (blockedBy):
${lines.join("\n")}

Gere um resumo executivo em markdown (pt-BR) com as secções abaixo (use exatamente estes títulos de nível 2):
## Visão geral
## Decisões pedidas ao comité
(Itens que exigem alocação, trade-off ou desbloqueio explícito; ligue a impacto de negócio.)
## Riscos com prazo
(Atrasos, datas iminentes, prioridade crítica, bloqueios externos ou internos relevantes.)
## Dependências externas
(Fornecedores, outras equipas, aprovações — inferir só quando o contexto do título/tags o sugere; caso não haja sinais, declare explicitamente que não há dependências externas evidentes nos dados.)
## Próximos passos sugeridos

Máximo ~450 palavras no total. Tom profissional e objetivo. Não invente factos que contradizem a lista de cards.`;
}

/** Brief curto ao abrir o board (Onda 4 — Daily Flow Briefing). */
export type ExecutiveRankJustifyCardLine = {
  id: string;
  title: string;
  bucket: string;
  priority: string;
  progress: string;
  dueDate?: string | null;
  direction?: string | null;
  blockedByCount: number;
};

export function buildExecutiveRankJustifyUserPrompt(
  boardName: string,
  cards: ExecutiveRankJustifyCardLine[]
): string {
  const lines = cards.map((c) => {
    const due = c.dueDate?.trim() ? `due:${c.dueDate}` : "due:-";
    const dir = c.direction?.trim() ? `dir:${c.direction}` : "dir:-";
    return `- id=${c.id} | ${c.title} | col:${c.bucket} | ${c.priority} | ${c.progress} | ${due} | ${dir} | deps:${c.blockedByCount}`;
  });
  return `Board: ${boardName}
Cartões (ordem fixa — não inverta nem omita linhas):
${lines.join("\n")}

Para cada cartão, na mesma ordem, uma frase curta em pt-BR (máx. 22 palavras) sobre por que o comité deve prestar atenção.
Responda APENAS com uma linha por cartão, formato exato:
ID=<uuid>|TEXTO=<frase>
Sem markdown nem texto extra.`;
}

export function parseExecutiveRankJustifyLines(
  assistantText: string,
  expectedIds: string[]
): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = assistantText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const m = line.match(/^ID=([^|]+)\|\s*TEXTO=(.+)$/i);
    if (!m) continue;
    const id = m[1].trim();
    const text = m[2].trim();
    if (id && text) out[id] = text;
  }
  for (const id of expectedIds) {
    if (!out[id]) out[id] = "";
  }
  return out;
}

export function buildDailyArrivalBriefPrompt(board: { name: string; cards: ExecutiveBriefCardSlice[] }): string {
  const sorted = [...board.cards].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const lines = sorted.slice(0, 80).map((c) => `- [${c.bucket}] ${c.title} (${c.priority})`);
  return `Board: ${board.name}
Cards (até 80):
${lines.join("\n")}

Gere um briefing diário curto em markdown (pt-BR): 3 bullets do que mudou ou merece atenção hoje, 1 risco, 1 próximo passo. Máximo ~180 palavras. Tom direto.`;
}
