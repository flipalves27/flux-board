import type { BoardData } from "@/lib/kv-boards";
import type { OverdueCard, WeeklyBoardToolMetrics } from "@/lib/weekly-digest-metrics";

export type OverdueAction = {
  title: string;
  action: string;
};

export type BoardWeeklyInsight = {
  summary: string;
  insight: string;
  overdueActions: OverdueAction[];
  generatedWithAI: boolean;
  model?: string;
  provider?: string;
  errorKind?: string;
  errorMessage?: string;
};

function extractTextFromLlmContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => {
        if (p && typeof p === "object") {
          const text = (p as any).text;
          if (typeof text === "string") return text;
          const t = (p as any).content;
          if (typeof t === "string") return t;
        }
        return "";
      })
      .join("");
  }
  return "";
}

function safeJsonParseCandidate(raw: string): unknown | null {
  const s = String(raw || "").trim();
  if (!s) return null;

  // Remove markdown fences (```json ... ```).
  const unFenced = s
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim();

  // Tenta extrair o primeiro objeto JSON.
  const firstBrace = unFenced.indexOf("{");
  const lastBrace = unFenced.lastIndexOf("}");
  const candidate = firstBrace >= 0 && lastBrace > firstBrace ? unFenced.slice(firstBrace, lastBrace + 1) : unFenced;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function daysUntilDue(date: string | null | undefined): number | null {
  if (!date || typeof date !== "string") return null;
  const due = new Date(`${date.trim()}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / 86400000);
}

function parseBucketKeys(board: BoardData): string[] {
  const bucketOrder = board?.config && Array.isArray((board.config as any).bucketOrder) ? (board.config as any).bucketOrder : [];
  const keys = bucketOrder
    .map((b: any) => (b && typeof b === "object" ? String(b.key || "") : ""))
    .filter(Boolean);
  return keys;
}

function makeHeuristicBoardInsight(args: {
  board: BoardData;
  boardName: string;
  metrics: WeeklyBoardToolMetrics;
  overdueCards: OverdueCard[];
}): { summary: string; insight: string; overdueActions: OverdueAction[] } {
  const { board, boardName, metrics, overdueCards } = args;

  const throughputCurrent = metrics.concludedCurrent;
  const throughputPrevious = metrics.concludedPrevious;
  const delta = throughputCurrent - throughputPrevious;
  const deltaText =
    throughputPrevious === 0
      ? throughputCurrent > 0
        ? "ganho"
        : "estável"
      : delta > 0
        ? "alta"
        : delta < 0
          ? "queda"
          : "estável";

  const summary = [
    `Resumo: ${metrics.createdCurrent} criados, ${metrics.movedCurrent} movidos, ${metrics.concludedCurrent} concluídos.`,
    `Throughput ${deltaText} vs. semana anterior (${throughputCurrent} vs ${throughputPrevious}).`,
    overdueCards.length ? `Atenção: ${overdueCards.length} card(s) atrasado(s).` : "Nenhum card atrasado no momento.",
  ].join(" ");

  // Heurística de estagnação por colunas iniciais.
  const bucketKeys = parseBucketKeys(board);
  const bucketIndexOf = (bucket: string) => {
    const idx = bucketKeys.findIndex((k) => k === bucket);
    return idx >= 0 ? idx : 0;
  };

  const cards = Array.isArray(board.cards) ? (board.cards as any[]) : [];
  const open = cards.filter((c) => c && typeof c === "object" && String(c.progress || "") !== "Concluída");
  let stagnationInsight = "";
  if (open.length > 0 && bucketKeys.length >= 2) {
    const early = open.filter((c) => bucketIndexOf(String(c.bucket || "")) <= 1).length;
    const earlyShare = early / open.length;
    if (earlyShare >= 0.72) {
      const col = bucketKeys[0] || "coluna inicial";
      stagnationInsight = `Padrão de estagnação na(s) coluna(s) inicial(is) (${col}). Considere revisar critérios de passagem e reduzir WIP.`;
    } else if (earlyShare >= 0.55) {
      const col = bucketKeys[0] || "coluna inicial";
      stagnationInsight = `Cards concentrados nas colunas iniciais (${col}). Avalie gargalos e defina próximos passos mais objetivos.`;
    }
  }

  const insight =
    stagnationInsight ||
    (overdueCards.length
      ? `Board ${boardName} mostra atraso recorrente. Priorize destravamentos na coluna do card mais antigo e ajuste prioridades para destravar o fluxo.`
      : `Board ${boardName} está respondendo, mas monitore gargalos por coluna e garanta cadência de revisão para manter throughput consistente.`);

  const overdueActions: OverdueAction[] = overdueCards.slice(0, 5).map((c) => {
    const d = daysUntilDue(c.dueDate);
    const atraso = d === null ? "" : ` (atraso de ${Math.abs(d)} dia(s))`;
    if (c.progress === "Não iniciado") {
      return { title: c.title, action: `Defina o próximo passo e confirme critérios de passagem${atraso}.` };
    }
    if (c.progress === "Em andamento") {
      return { title: c.title, action: `Identifique bloqueios e ajuste prioridades para destravar o card${atraso}.` };
    }
    return { title: c.title, action: `Reavalie a estratégia do card e alinhe com a coluna/critério adequado${atraso}.` };
  });

  return { summary, insight: insight.replace(/^Board\s+/i, ""), overdueActions };
}

export async function generateBoardWeeklyDigestInsightAI(args: {
  board: BoardData;
  boardName: string;
  metrics: WeeklyBoardToolMetrics;
  overdueCards: OverdueCard[];
  allowAI?: boolean;
}): Promise<BoardWeeklyInsight> {
  const { board, boardName, metrics, overdueCards, allowAI } = args;

  const cap = process.env.WEEKLY_DIGEST_AI_CAP; // opcional (limite local para teste)
  const togetherEnabled = Boolean(process.env.TOGETHER_API_KEY) && Boolean(process.env.TOGETHER_MODEL);
  const apiKey = process.env.TOGETHER_API_KEY;
  const model = process.env.TOGETHER_MODEL;

  const bucketKeys = parseBucketKeys(board);
  const bucketHint = bucketKeys.length ? bucketKeys.join(", ") : "—";

  if (!allowAI || !togetherEnabled || !apiKey || !model || (cap && Number(cap) === 0)) {
    const heuristic = makeHeuristicBoardInsight({ board, boardName, metrics, overdueCards });
    return { ...heuristic, generatedWithAI: false, provider: "together.ai" };
  }

  const throughputCurrent = metrics.concludedCurrent;
  const throughputPrevious = metrics.concludedPrevious;
  const delta = throughputCurrent - throughputPrevious;
  const deltaPct = throughputPrevious > 0 ? Math.round((delta / throughputPrevious) * 100) : null;

  const overdueSnapshot = overdueCards
    .slice(0, 5)
    .map((c, i) => {
      const dd = c.dueDate;
      return `${i + 1}. "${c.title}" | bucket=${c.bucket} | progress=${c.progress} | prioridade=${c.priority} | dueDate=${dd}`;
    })
    .join("\n");

  const prompt = [
    "Você é um assistente IA focado em gestão e fluxo de Kanban.",
    "Objetivo: gerar um resumo semanal e 1 insight acionável para diretoria.",
    "Retorne JSON puro e somente o JSON (sem markdown, sem texto extra).",
    "Formato JSON:",
    '{ "summary": string, "insight": string, "overdueActions": [{ "title": string, "action": string }] }',
    "",
    "Regras:",
    "- summary: máximo de 6 linhas, português claro.",
    "- insight: 2 a 4 linhas; precisa mencionar um padrão (ex: estagnação em coluna específica, queda de throughput, concentração em WIP).",
    "- overdueActions: use somente títulos que aparecem em overdueCards (até 5 itens).",
    "- action: 1 frase iniciando com verbo (ex: 'Defina...', 'Remova...', 'Reavalie...'), curta.",
    "",
    `Board: ${boardName}`,
    `Atrasos (cards atrasados atuais): ${overdueCards.length}`,
    `Cards criados/ movidos/ concluídos nesta semana: created=${metrics.createdCurrent}, moved=${metrics.movedCurrent}, concluded=${metrics.concludedCurrent}`,
    `Throughput: atual=${throughputCurrent}, anterior=${throughputPrevious}${deltaPct !== null ? ` (${deltaPct}% )` : ""}`,
    `Colunas (bucket keys em ordem): ${bucketHint}`,
    "",
    overdueSnapshot ? `overdueCards:\n${overdueSnapshot}` : "overdueCards: (vazio)",
  ].join("\n");

  const baseUrl = (process.env.TOGETHER_BASE_URL || "https://api.together.xyz/v1").replace(/\/+$/, "");

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const heuristic = makeHeuristicBoardInsight({ board, boardName, metrics, overdueCards });
      return {
        ...heuristic,
        generatedWithAI: false,
        provider: "together.ai",
        errorKind: "http_error",
        errorMessage: `HTTP ${response.status} ${response.statusText}`,
      };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
    };
    const raw = extractTextFromLlmContent(data.choices?.[0]?.message?.content) || "";
    const parsed = safeJsonParseCandidate(raw);
    const obj = parsed && typeof parsed === "object" ? (parsed as any) : null;

    if (!obj || typeof obj.summary !== "string" || typeof obj.insight !== "string") {
      const heuristic = makeHeuristicBoardInsight({ board, boardName, metrics, overdueCards });
      return {
        ...heuristic,
        generatedWithAI: false,
        provider: "together.ai",
        errorKind: "bad_json",
        errorMessage: "Resposta da IA não estava no formato esperado.",
      };
    }

    const overdueActions: OverdueAction[] = Array.isArray(obj.overdueActions)
      ? obj.overdueActions
          .slice(0, 5)
          .map((x: any) => ({
            title: typeof x?.title === "string" ? x.title : "",
            action: typeof x?.action === "string" ? x.action : "",
          }))
          .filter((x: OverdueAction) => x.title && x.action)
      : [];

    const heuristic = makeHeuristicBoardInsight({ board, boardName, metrics, overdueCards });
    const safeOverdueActions = overdueActions.length ? overdueActions : heuristic.overdueActions;

    return {
      summary: String(obj.summary).trim().slice(0, 900),
      insight: String(obj.insight).trim().slice(0, 500),
      overdueActions: safeOverdueActions,
      generatedWithAI: true,
      model,
      provider: "together.ai",
      errorKind: undefined,
    };
  } catch (err) {
    const heuristic = makeHeuristicBoardInsight({ board, boardName, metrics, overdueCards });
    return {
      ...heuristic,
      generatedWithAI: false,
      provider: "together.ai",
      errorKind: "network_error",
      errorMessage: err instanceof Error ? err.message : "Erro de rede ao chamar a IA.",
    };
  }
}

