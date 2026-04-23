import { safeJsonParse } from "@/lib/llm-utils";
import type { OkrKrProjection } from "@/lib/okr-projection";
import type { Organization } from "@/lib/kv-organizations";
import { runOrgLlmChat } from "@/lib/llm-org-chat";
import { isOrgCloudLlmConfigured } from "@/lib/org-ai-routing";

export type OkrWeeklyDigestBlock = {
  headline: string;
  bullets: string[];
  generatedWithAI: boolean;
  model?: string;
  provider?: string;
  errorKind?: string;
  errorMessage?: string;
};

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
  org?: Organization | null;
  orgId?: string;
}): Promise<OkrWeeklyDigestBlock> {
  const { orgName, quarter, projections, allowAI, org, orgId } = args;

  const cap = process.env.WEEKLY_DIGEST_AI_CAP;
  const canCall = isOrgCloudLlmConfigured(org ?? null);

  if (!projections.length) {
    return {
      headline: "OKRs",
      bullets: ["Nenhum KR encontrado para este quarter."],
      generatedWithAI: false,
    };
  }

  if (!allowAI || !canCall || (cap && Number(cap) === 0) || !orgId) {
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

  try {
    const response = await runOrgLlmChat({
      org: org ?? null,
      orgId,
      feature: "weekly_digest_okr",
      messages: [{ role: "user", content: prompt }],
      options: { temperature: 0.25 },
      mode: "batch",
    });

    if (!response.ok) {
      const h = heuristicOkrDigest(projections);
      return {
        ...h,
        generatedWithAI: false,
        provider: "openai_compat",
        errorKind: "http_error",
        errorMessage: response.error || "request_failed",
      };
    }

    const raw = response.assistantText || "";
    const parsed = safeJsonParse(raw);
    const obj = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;

    if (!obj || typeof obj.headline !== "string" || !Array.isArray(obj.bullets)) {
      const h = heuristicOkrDigest(projections);
      return {
        ...h,
        generatedWithAI: false,
        provider: "openai_compat",
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
      model: response.model,
      provider: "openai_compat",
    };
  } catch (err) {
    const h = heuristicOkrDigest(projections);
    return {
      ...h,
      generatedWithAI: false,
      provider: "openai_compat",
      errorKind: "network_error",
      errorMessage: err instanceof Error ? err.message : "Erro de rede",
    };
  }
}
