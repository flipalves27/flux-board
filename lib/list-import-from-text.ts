import "server-only";

import type { BoardData } from "@/app/board/[id]/page";
import type { Organization } from "@/lib/kv-organizations";
import { safeJsonParse } from "@/lib/llm-utils";
import { runOrgLlmChat } from "@/lib/llm-org-chat";
import { SPEC_PLAN_LLM_DOC_CHUNK_CHARS } from "@/lib/spec-plan-constants";
import type { BoardImportExtractMeta } from "@/lib/spec-plan-form-parse";
import { SpecPlanApplyBodySchema } from "@/lib/spec-plan-schemas";
import { fluxyPromptPrefix } from "@/lib/fluxy-persona";
import { z } from "zod";

const LIST_IMPORT_FEATURE = "board_pdf_list_import" as const;

const LIST_LLM_JSON_RETRY_SUFFIX =
  "\n\nA resposta anterior não foi JSON válido ou estava incompleta. Devolva um ÚNICO objeto JSON completo. Schema exato: { \"cards\": [ { \"title\": string, \"desc\": string, \"bucketKey\": string, \"priority\": string, \"progress\": string, \"tags\": string[], \"rationale\": string, \"blockedByTitles\": string[], \"subtasks\": [{\"title\": string}], \"storyPoints\": null|int, \"serviceClass\": null|\"expedite\"|\"fixed_date\"|\"standard\"|\"intangible\" } ] }. Sem markdown. Fecha todas as chaves e colchetes. Máximo 100 cards. Priorize JSON válido.";

const PRIORITIES = ["Urgente", "Importante", "Média"] as const;
const PROGRESSES = ["Não iniciado", "Em andamento", "Concluída"] as const;

function listImportMaxOutputTokens(itemCount: number): number {
  const n = Math.max(1, Math.min(120, itemCount));
  const estimated = 1200 + n * 140;
  return Math.min(12_000, Math.max(2500, Math.round(estimated)));
}

function buildBoardListImportContext(board: BoardData): string {
  const bucketOrder = Array.isArray(board.config?.bucketOrder) ? board.config!.bucketOrder! : [];
  const columns = bucketOrder
    .map((b) => {
      const key = String((b as { key?: string }).key || "").trim();
      const label = String((b as { label?: string }).label || key).trim();
      const pol = String((b as { policy?: string }).policy || "").trim();
      return `  - bucketKey (use exatamente): "${key}" | rótulo: ${label}${pol ? ` | política: ${pol.slice(0, 200)}` : ""}`;
    })
    .join("\n");

  const labelPalette = new Set<string>();
  const cfgLabels = board.config?.labels;
  if (Array.isArray(cfgLabels)) {
    for (const t of cfgLabels) {
      if (typeof t === "string" && t.trim()) labelPalette.add(t.trim().slice(0, 64));
    }
  }
  const cards = Array.isArray(board.cards) ? board.cards : [];
  for (const c of cards.slice(0, 200)) {
    if (c && typeof c === "object") {
      const tags = (c as { tags?: string[] }).tags;
      if (Array.isArray(tags)) {
        for (const t of tags) {
          if (typeof t === "string" && t.trim()) {
            labelPalette.add(t.trim().slice(0, 64));
            if (labelPalette.size >= 80) break;
          }
        }
      }
    }
  }
  const tagsStr = [...labelPalette].slice(0, 40).join(", ") || "(nenhuma — crie rótulos curtos em português quando fizer sentido)";

  return [
    "Você converte um documento (backlog, lista, ata, tabela) em cards para o quadro Kanban.",
    "Regras:",
    `- Prioridade deve ser exatamente uma de: ${PRIORITIES.join(", ")}.`,
    `- Progresso deve ser exatamente uma de: ${PROGRESSES.join(", ")}. Use "Não iniciado" para itens novos salvo se o texto indicar outro estado.`,
    "- bucketKey DEVE ser exatamente uma das chaves listadas abaixo (string idêntica, incluindo acentos e espaços).",
    "- Preencha desc com contexto, critérios de aceite ou notas; rationale com uma linha sobre por que esta coluna/prioridade.",
    "- tags: use apenas rótulos do quadro quando possível; no máximo 8 por card.",
    "- blockedByTitles: títulos de dependências (outros itens do documento) quando fizer sentido; subtasks: passos pequenos quando fizer sentido; storyPoints Fibonacci 1,2,3,5,8,13 ou null; serviceClass opcional (Kanban) ou null.",
    "- Até 100 cards; ordene de forma lógica (p.ex. prioridade do documento). Não duplicar títulos quase idênticos.",
    "Colunas do board:",
    columns || "  (sem colunas — defina bucketKey com o nome de coluna mais próximo; preferir Backlog se existir)",
    `Rótulos conhecidos (preferir): ${tagsStr}`,
  ].join("\n");
}

/**
 * Lê o texto (PDF extraído etc.) e gera o payload de aplicação ao board (mesmo shape do apply do Spec).
 */
export async function listImportCardsFromDocument(input: {
  org: Organization | null;
  orgId: string;
  userId: string;
  isAdmin: boolean;
  board: BoardData;
  documentText: string;
  extractMeta: BoardImportExtractMeta;
}): Promise<
  | { ok: true; data: z.infer<typeof SpecPlanApplyBodySchema>; usedLlm: true; warnings: string[] }
  | { ok: false; error: string; usedLlm: boolean }
> {
  const warnings: string[] = [...(input.extractMeta.warnings || [])];
  const fullLen = input.documentText.length;
  const docForLlm =
    fullLen > SPEC_PLAN_LLM_DOC_CHUNK_CHARS
      ? input.documentText.slice(0, SPEC_PLAN_LLM_DOC_CHUNK_CHARS) + "\n\n[... documento truncado para análise ...]"
      : input.documentText;
  if (fullLen > SPEC_PLAN_LLM_DOC_CHUNK_CHARS) {
    warnings.push("documento_truncado_para_llm");
  }

  const userContent = [
    buildBoardListImportContext(input.board),
    `Arquivo fonte: ${input.extractMeta.fileName} (${input.extractMeta.kind}).`,
    "Conteúdo:",
    docForLlm,
  ].join("\n\n");

  async function callLlm(suffix: string) {
    return runOrgLlmChat({
      org: input.org,
      orgId: input.orgId,
      feature: LIST_IMPORT_FEATURE,
      messages: [
        { role: "user", content: fluxyPromptPrefix() + userContent + suffix },
      ],
      options: { temperature: 0.2, maxTokens: listImportMaxOutputTokens(100) },
      mode: "batch",
      userId: input.userId,
      isAdmin: input.isAdmin,
    });
  }

  let res = await callLlm(
    "\n\nResponda SOMENTE com JSON: { \"cards\": [ ... ] } conforme o contexto. Sem markdown, sem comentários."
  );
  if (!res.ok) {
    return { ok: false, error: res.error || "LLM indisponível", usedLlm: false };
  }
  let parsed = safeJsonParse(String(res.assistantText || ""));
  let bodyParsed = SpecPlanApplyBodySchema.safeParse(parsed);
  if (!bodyParsed.success) {
    res = await callLlm(LIST_LLM_JSON_RETRY_SUFFIX);
    if (!res.ok) {
      return { ok: false, error: "Não foi possível interpretar a resposta da IA (JSON).", usedLlm: true };
    }
    parsed = safeJsonParse(String(res.assistantText || ""));
    bodyParsed = SpecPlanApplyBodySchema.safeParse(parsed);
  }
  if (!bodyParsed.success) {
    return {
      ok: false,
      error: "A IA não retornou uma lista de cards válida. Tente outro documento ou cole o texto.",
      usedLlm: true,
    };
  }

  return { ok: true, data: bodyParsed.data, usedLlm: true, warnings };
}
