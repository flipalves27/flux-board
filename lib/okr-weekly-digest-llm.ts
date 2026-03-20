import type { OkrKrProjection } from "@/lib/okr-projection";

export type OkrWeeklyDigestBlock = {
  headline: string;
  bullets: string[];
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

function safeJsonParseCandidate(raw: string): unknown | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  const unFenced = s
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim();
  const firstBrace = unFenced.indexOf("{");
  const lastBrace = unFenced.lastIndexOf("}");
  const candidate = firstBrace >= 0 && lastBrace > firstBrace ? unFenced.slice(firstBrace, lastBrace + 1) : unFenced;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function heuristicOkrDigest(projections: OkrKrProjection[]): OkrWeeklyDigestBlock {
  const risks = projections.filter((p) => p.riskBelowThreshold);
  const bullets: string[] = [];

  for (const p of projections.slice(0, 6)) {
    const stuck =
      typeof p.stuckInColumnOver7d === "number" && p.stuckInColumnOver7d > 0
        ? ` Gargalo: ${p.stuckInColumnOver7d} card(s) parados na coluna há >7 dias.`
        : "";
    bullets.push(`KR "${p.krTitle}" (${p.pct}%): ${p.summaryLine.replace(/^⚠️\s*/, "")}${stuck}`);
  }

  const headline =
    risks.length > 0
      ? `Atenção: ${risks.length} KR(s) com projeção linear abaixo de 80% ao fim do quarter.`
      : "OKRs: revisão semanal de ritmo e gargalos por board.";

  return { headline, bullets: bullets.slice(0, 8), generatedWithAI: false };
}

export async function generateOkrWeeklyDigestBlockAI(args: {
  orgName: string;
  quarter: string;
  projections: OkrKrProjection[];
  allowAI?: boolean;
}): Promise<OkrWeeklyDigestBlock> {
  const { orgName, quarter, projections, allowAI } = args;

  const cap = process.env.WEEKLY_DIGEST_AI_CAP;
  const togetherEnabled = Boolean(process.env.TOGETHER_API_KEY) && Boolean(process.env.TOGETHER_MODEL);
  const apiKey = process.env.TOGETHER_API_KEY;
  const model = process.env.TOGETHER_MODEL;

  if (!projections.length) {
    return {
      headline: "OKRs",
      bullets: ["Nenhum KR encontrado para este quarter."],
      generatedWithAI: false,
    };
  }

  if (!allowAI || !togetherEnabled || !apiKey || !model || (cap && Number(cap) === 0)) {
    return heuristicOkrDigest(projections);
  }

  const snapshot = projections
    .slice(0, 12)
    .map((p, i) => {
      const stuck =
        typeof p.stuckInColumnOver7d === "number" ? `stuck7d=${p.stuckInColumnOver7d}` : "stuck7d=n/a";
      return `${i + 1}. obj="${p.objectiveTitle}" | kr="${p.krTitle}" | ${p.current}/${p.target} (${p.pct}%) | projQ=${p.projectedPctAtQuarterEnd}% | risk=${p.riskBelowThreshold} | ${stuck} | ${p.detailLine}`;
    })
    .join("\n");

  const prompt = [
    "Você é um coach de execução para OKRs em Kanban.",
    "Objetivo: recomendações semanais específicas (gargalos, ritmo, próximo passo).",
    "Retorne JSON puro e somente o JSON (sem markdown).",
    'Formato: { "headline": string, "bullets": string[] }',
    "",
    "Regras:",
    "- headline: 1 linha, PT-BR.",
    "- bullets: 3 a 8 itens; cada item cita um KR pelo título; mencione gargalo (cards parados) quando stuck7d>0.",
    "- Seja concreto (ex.: revisar critérios, redistribuir, reduzir WIP).",
    "",
    `Organização: ${orgName}`,
    `Quarter: ${quarter}`,
    "",
    "Dados:",
    snapshot,
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
        temperature: 0.25,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const h = heuristicOkrDigest(projections);
      return {
        ...h,
        generatedWithAI: false,
        provider: "together.ai",
        errorKind: "http_error",
        errorMessage: `HTTP ${response.status}`,
      };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
    };
    const raw = extractTextFromLlmContent(data.choices?.[0]?.message?.content) || "";
    const parsed = safeJsonParseCandidate(raw);
    const obj = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;

    if (!obj || typeof obj.headline !== "string" || !Array.isArray(obj.bullets)) {
      const h = heuristicOkrDigest(projections);
      return {
        ...h,
        generatedWithAI: false,
        provider: "together.ai",
        errorKind: "bad_json",
        errorMessage: "Resposta da IA fora do formato.",
      };
    }

    const bullets = obj.bullets
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 10);

    return {
      headline: String(obj.headline).trim().slice(0, 240),
      bullets: bullets.length ? bullets : heuristicOkrDigest(projections).bullets,
      generatedWithAI: true,
      model,
      provider: "together.ai",
    };
  } catch (err) {
    const h = heuristicOkrDigest(projections);
    return {
      ...h,
      generatedWithAI: false,
      provider: "together.ai",
      errorKind: "network_error",
      errorMessage: err instanceof Error ? err.message : "Erro de rede",
    };
  }
}
