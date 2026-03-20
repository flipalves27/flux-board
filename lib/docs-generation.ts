import type { BoardData } from "@/lib/kv-boards";
import { aggregatePortfolio, boardsToPortfolioRows } from "@/lib/portfolio-export-core";
import { chunkDocMarkdown } from "@/lib/docs-rag";
import type { DocData } from "@/lib/kv-docs";
import type { OkrKrProjection } from "@/lib/okr-projection";

export type DocsGenerationFlow = "board_status" | "daily_minutes" | "okr_progress" | "free_prompt";

function extractTextFromLlmContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => {
        if (p && typeof p === "object") {
          const text = (p as { text?: string }).text;
          if (typeof text === "string") return text;
          const t = (p as { content?: string }).content;
          if (typeof t === "string") return t;
        }
        return "";
      })
      .join("");
  }
  return "";
}

function togetherEnabled(): boolean {
  return Boolean(process.env.TOGETHER_API_KEY) && Boolean(process.env.TOGETHER_MODEL);
}

export async function generateMarkdownWithTogether(args: {
  system: string;
  user: string;
  temperature?: number;
}): Promise<{ ok: true; markdown: string; model: string } | { ok: false; markdown: string; error: string }> {
  const apiKey = process.env.TOGETHER_API_KEY;
  const model = process.env.TOGETHER_MODEL;
  if (!togetherEnabled() || !apiKey || !model) {
    return { ok: false, markdown: "", error: "IA não configurada (Together.ai)." };
  }

  const baseUrl = (process.env.TOGETHER_BASE_URL || "https://api.together.xyz/v1").replace(/\/+$/, "");
  const prompt = [`### Instruções do sistema\n${args.system}`, "", "### Dados de entrada\n", args.user].join("\n");

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: args.temperature ?? 0.3,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      return { ok: false, markdown: "", error: `HTTP ${response.status}` };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
    };
    const raw = extractTextFromLlmContent(data.choices?.[0]?.message?.content) || "";
    const md = String(raw || "").trim();
    if (!md) {
      return { ok: false, markdown: "", error: "Resposta vazia da IA." };
    }
    return { ok: true, markdown: md, model };
  } catch (err) {
    return { ok: false, markdown: "", error: err instanceof Error ? err.message : "Erro de rede" };
  }
}

export function formatBoardAndPortfolioContext(board: BoardData, allBoards: BoardData[]): string {
  const rows = boardsToPortfolioRows(allBoards);
  const agg = aggregatePortfolio(rows);
  const cards = Array.isArray(board.cards) ? board.cards : [];
  const mine = rows.find((r) => r.id === board.id);

  const lines: string[] = [];
  lines.push(`Board: ${String(board.name || board.id)} (id=${board.id})`);
  lines.push(`Cards (${cards.length}):`);
  for (const c of cards.slice(0, 80)) {
    if (!c || typeof c !== "object") continue;
    const o = c as Record<string, unknown>;
    lines.push(
      `- ${String(o.title || "")} | progresso=${String(o.progress || "")} | prioridade=${String(o.priority || "")} | coluna=${String(o.bucket || "")}`
    );
  }
  if (cards.length > 80) lines.push(`(... +${cards.length - 80} cards)`);

  lines.push("");
  lines.push("Portfólio (agregado da org):");
  lines.push(
    `boards=${agg.boardCount}; comCards=${agg.boardsWithCards}; riscoMedio=${agg.avgRisco ?? "—"}; throughputMedio=${agg.avgThroughput ?? "—"}; previsMedio=${agg.avgPrevisibilidade ?? "—"}; boardsRiscoBaixo=${agg.atRiskCount}`
  );
  if (mine) {
    lines.push(
      `Este board: risco=${mine.portfolio.risco ?? "—"} | throughput=${mine.portfolio.throughput ?? "—"} | previsibilidade=${mine.portfolio.previsibilidade ?? "—"} | cards=${mine.portfolio.cardCount}`
    );
  }
  const sample = [...rows]
    .sort((a, b) => (a.portfolio.throughput ?? 0) - (b.portfolio.throughput ?? 0))
    .slice(0, 8)
    .map((r) => `${r.name.slice(0, 36)}|risco=${r.portfolio.risco ?? "—"}|thr=${r.portfolio.throughput ?? "—"}`);
  lines.push(`Amostra outros boards: ${sample.join(" || ")}`);

  return lines.join("\n");
}

export function heuristicBoardStatusMarkdown(board: BoardData, allBoards: BoardData[], title: string): string {
  const ctx = formatBoardAndPortfolioContext(board, allBoards);
  const cards = Array.isArray(board.cards) ? board.cards : [];
  const lines = [
    `# ${title}`,
    "",
    `_Gerado automaticamente (modo estruturado) em ${new Date().toISOString()}._`,
    "",
    "## Resumo",
    "",
    ctx.split("\n").slice(0, 6).join("\n"),
    "",
    "## Itens do board",
    "",
    ...cards.slice(0, 40).map((c: any) => `- **${String(c.title || "")}** (${String(c.progress || "")} / ${String(c.priority || "")})`),
  ];
  if (cards.length > 40) lines.push("", `… e mais ${cards.length - 40} card(s).`);
  return lines.join("\n");
}

export function pickDailyEntry(board: BoardData, dailyInsightId?: string | null): { id: string; transcript: string; insight: unknown; createdAt?: string } | null {
  const daily = Array.isArray(board.dailyInsights) ? board.dailyInsights : [];
  if (!daily.length) return null;
  const sorted = [...daily].sort((a: any, b: any) => {
    const ta = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });
  if (dailyInsightId) {
    const m = /^idx_(\d+)$/.exec(dailyInsightId);
    if (m) {
      const idx = parseInt(m[1], 10);
      const byIndex = sorted[idx];
      if (byIndex && typeof byIndex === "object") {
        const e = byIndex as Record<string, unknown>;
        return {
          id: String(e.id || dailyInsightId),
          transcript: String(e.transcript || ""),
          insight: e.insight,
          createdAt: typeof e.createdAt === "string" ? e.createdAt : undefined,
        };
      }
    }
    const found = sorted.find((e: any) => String(e?.id || "") === dailyInsightId);
    if (!found || typeof found !== "object") return null;
    const e = found as Record<string, unknown>;
    return {
      id: String(e.id || dailyInsightId),
      transcript: String(e.transcript || ""),
      insight: e.insight,
      createdAt: typeof e.createdAt === "string" ? e.createdAt : undefined,
    };
  }
  const latest = sorted[0] as Record<string, unknown>;
  return {
    id: String(latest.id || "latest"),
    transcript: String(latest.transcript || ""),
    insight: latest.insight,
    createdAt: typeof latest.createdAt === "string" ? latest.createdAt : undefined,
  };
}

export function formatDailyForPrompt(
  board: BoardData,
  dailyInsightId?: string | null,
  transcriptOverride?: string | null
): string {
  if (transcriptOverride?.trim()) {
    return [`Board: ${String(board.name || board.id)}`, "", "## Transcrição", transcriptOverride.trim().slice(0, 24_000)].join("\n");
  }
  const entry = pickDailyEntry(board, dailyInsightId);
  if (!entry) {
    return "(Sem entradas de Daily IA neste board — cole uma transcrição no formulário ou grave uma Daily antes.)";
  }
  const insightJson = entry.insight ? JSON.stringify(entry.insight).slice(0, 12_000) : "(sem insight estruturado)";
  return [
    `Board: ${String(board.name || board.id)}`,
    `Daily id: ${entry.id}`,
    entry.createdAt ? `Criada em: ${entry.createdAt}` : "",
    "",
    "## Transcrição",
    entry.transcript.slice(0, 24_000) || "(vazia)",
    "",
    "## Insight (JSON resumido)",
    insightJson,
  ]
    .filter(Boolean)
    .join("\n");
}

export function heuristicDailyMinutesMarkdown(
  board: BoardData,
  dailyInsightId: string | null | undefined,
  title: string,
  transcriptOverride?: string | null
): string {
  if (transcriptOverride?.trim()) {
    return [
      `# ${title}`,
      "",
      `_Ata (modo estruturado) em ${new Date().toISOString()}._`,
      "",
      "## Transcrição recebida",
      "",
      "```",
      transcriptOverride.trim().slice(0, 8000),
      "```",
    ].join("\n");
  }
  const entry = pickDailyEntry(board, dailyInsightId);
  const lines = [
    `# ${title}`,
    "",
    `_Ata gerada automaticamente em ${new Date().toISOString()}._`,
    "",
    "## Participantes / contexto",
    "",
    "— (preencher manualmente se necessário)",
    "",
    "## Decisões",
    "",
    "- (nenhuma inferida automaticamente)",
    "",
    "## Ações",
    "",
  ];
  if (entry?.insight && typeof entry.insight === "object") {
    const ins = entry.insight as Record<string, unknown>;
    const pend = ins.pendencias;
    if (Array.isArray(pend)) {
      for (const p of pend.slice(0, 12)) lines.push(`- ${String(p)}`);
    }
  } else if (entry?.transcript) {
    lines.push("- Ver transcrição bruta na seção final.");
  }
  lines.push("", "## Transcrição (trecho)", "", "```", (entry?.transcript || "").slice(0, 4000), "```");
  return lines.join("\n");
}

export function formatOkrProjectionsForPrompt(projections: OkrKrProjection[], quarter: string): string {
  if (!projections.length) return "(Sem KRs / projeções para este board e quarter.)";
  return projections
    .slice(0, 16)
    .map((p, i) => {
      const risk = p.riskBelowThreshold ? "RISCO" : "ok";
      return `${i + 1}. [${risk}] ${p.objectiveTitle} → KR "${p.krTitle}" | ${p.current}/${p.target} (${p.pct}%) | proj.fim Q=${p.projectedPctAtQuarterEnd}% | ${p.summaryLine}`;
    })
    .join("\n");
}

export function heuristicOkrProgressMarkdown(projections: OkrKrProjection[], quarter: string, title: string): string {
  const lines = [
    `# ${title}`,
    "",
    `_Relatório estruturado em ${new Date().toISOString()} — quarter ${quarter}._`,
    "",
    "## Panorama",
    "",
  ];
  if (!projections.length) {
    lines.push("Nenhum Key Result encontrado para este board no quarter informado.");
    return lines.join("\n");
  }
  for (const p of projections.slice(0, 12)) {
    lines.push(`### ${p.krTitle}`, "", `- Progresso: ${p.current} / ${p.target} (${p.pct}%)`, `- Projeção ao fim do quarter: ${p.projectedPctAtQuarterEnd}%`, `- ${p.detailLine}`, "");
  }
  return lines.join("\n");
}

export function formatFreePromptContext(board: BoardData, userPrompt: string): string {
  const cards = Array.isArray(board.cards) ? board.cards : [];
  const cardLines = cards.slice(0, 60).map((c: any) => `- ${String(c.title || "")} (${String(c.bucket || "")})`);
  return [
    "## Pedido do usuário",
    userPrompt.slice(0, 8_000),
    "",
    `## Board ${String(board.name || board.id)}`,
    `Cards: ${cards.length}`,
    ...cardLines,
  ].join("\n");
}

export function heuristicFreePromptMarkdown(board: BoardData, userPrompt: string, title: string): string {
  return [
    `# ${title}`,
    "",
    `_Gerado em ${new Date().toISOString()} a partir do pedido e do estado atual do board._`,
    "",
    "## Solicitação",
    "",
    userPrompt,
    "",
    "## Dados utilizados",
    "",
    `- Board: **${String(board.name || board.id)}**`,
    `- Cards no board: ${Array.isArray(board.cards) ? board.cards.length : 0}`,
  ].join("\n");
}

function currentQuarterLabel(): string {
  const now = new Date();
  const year = now.getFullYear();
  const q = Math.floor(now.getMonth() / 3) + 1;
  return `${year}-Q${q}`;
}

export function defaultTitleForFlow(
  flow: DocsGenerationFlow,
  board: BoardData,
  quarter?: string | null
): string {
  const name = String(board.name || board.id).slice(0, 48);
  const q = quarter || currentQuarterLabel();
  switch (flow) {
    case "board_status":
      return `Status Report — ${name}`;
    case "daily_minutes":
      return `Ata Daily — ${new Date().toLocaleDateString("pt-BR")} — ${name}`;
    case "okr_progress":
      return `OKR Progress Report — ${q} — ${name}`;
    case "free_prompt":
      return `Documento IA — ${name}`;
    default:
      return `Documento — ${name}`;
  }
}

export function flowTag(flow: DocsGenerationFlow): string {
  switch (flow) {
    case "board_status":
      return "ia-docs:board-status";
    case "daily_minutes":
      return "ia-docs:daily-minutes";
    case "okr_progress":
      return "ia-docs:okr-progress";
    case "free_prompt":
      return "ia-docs:free-prompt";
    default:
      return "ia-docs";
  }
}

export function ragChunkCountAfterSave(doc: DocData): number {
  return chunkDocMarkdown(doc).length;
}
