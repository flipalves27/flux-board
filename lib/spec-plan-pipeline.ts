import "server-only";

import type { Organization } from "@/lib/kv-organizations";
import { DEFAULT_GENERAL_EMBEDDING_MODEL } from "@/lib/embeddings-together";
import { safeJsonParse } from "@/lib/llm-utils";
import { runOrgLlmChat } from "@/lib/llm-org-chat";
import { SPEC_PLAN_LLM_DOC_CHUNK_CHARS } from "@/lib/spec-plan-constants";
import { chunkSpecPlainText } from "@/lib/spec-plan-chunk";
import {
  buildCardsUserPrompt,
  buildOutlineUserPrompt,
  buildRemapUserPrompt,
  buildWorkItemsUserPrompt,
  type SpecPlanMethodology,
} from "@/lib/spec-plan-methodology-prompts";
import { buildSpecPlanRetrievalContext } from "@/lib/spec-plan-retrieval";
import { compactOutlineForWorkItemsJson } from "@/lib/spec-plan-outline-compact";
import { compactRemapWorkItemsJsonString, compactWorkItemsForCardsJson } from "@/lib/spec-plan-work-items-compact";
import { hydrateSpecPlanCardRows } from "@/lib/spec-plan-cards-hydrate";
import { CardsSlimLlmSchema, OutlineLlmSchema, WorkItemsLlmSchema } from "@/lib/spec-plan-schemas";
import { fluxyPromptPrefix } from "@/lib/fluxy-persona";

const CARDS_LLM_JSON_RETRY_SUFFIX =
  "\n\nA resposta anterior não foi JSON válido ou estava incompleta. Devolva um ÚNICO objeto JSON completo (feche todas as chaves {} e colchetes []). Sem markdown, sem texto antes ou depois. Schema: { \"cardRows\": [ ... ] } apenas com workItemId, bucketKey, bucketRationale (≤200 caracteres), priority, rationale (≤400 caracteres), tags, storyPoints, serviceClass, blockedByTitles, subtasks — sem title, desc nem progress. No máximo 40 entradas; prefira JSON válido a texto longo truncado.";

function cardsMaxOutputTokens(itemCount: number): number {
  const n = Math.max(1, Math.min(60, itemCount));
  const estimated = 800 + n * 72;
  return Math.min(7500, Math.max(1400, Math.round(estimated)));
}

export type SpecPlanPipelineEvent =
  | { event: "document_parsed"; data: Record<string, unknown> }
  | { event: "chunks_ready"; data: Record<string, unknown> }
  | { event: "embeddings_ready"; data: Record<string, unknown> }
  | { event: "retrieval_ready"; data: Record<string, unknown> }
  | { event: "outline_ready"; data: Record<string, unknown> }
  | { event: "work_items_llm_started"; data: Record<string, unknown> }
  | { event: "work_items_draft"; data: Record<string, unknown> }
  | { event: "methodology_applied"; data: Record<string, unknown> }
  | { event: "cards_llm_started"; data: Record<string, unknown> }
  | { event: "bucket_mapping"; data: Record<string, unknown> }
  | { event: "cards_preview"; data: Record<string, unknown> }
  | {
      event: "error";
      data: { message: string; code?: string; details?: unknown; cause?: string; stack?: string };
    };

async function llmJson(params: {
  org: Organization;
  orgId: string;
  userId: string;
  isAdmin: boolean;
  userContent: string;
  /** Saída JSON: outline ~6k; itens/cartões até 8k (teto Anthropic no provider). */
  maxOutputTokens?: number;
  temperature?: number;
}): Promise<{ ok: true; json: unknown } | { ok: false; message: string }> {
  const maxTokens = params.maxOutputTokens ?? 7200;
  const temperature = params.temperature ?? 0.15;
  const res = await runOrgLlmChat({
    org: params.org,
    orgId: params.orgId,
    feature: "spec_ai_scope_planner",
    messages: [{ role: "user", content: fluxyPromptPrefix() + params.userContent }],
    options: { temperature, maxTokens },
    mode: "batch",
    userId: params.userId,
    isAdmin: params.isAdmin,
  });
  if (!res.ok) {
    return { ok: false, message: res.error || "LLM indisponível" };
  }
  const parsed = safeJsonParse(String(res.assistantText || ""));
  if (parsed == null) {
    return { ok: false, message: "Resposta da IA não é JSON válido." };
  }
  return { ok: true, json: parsed };
}

export async function runSpecPlanPipeline(input: {
  org: Organization;
  orgId: string;
  userId: string;
  isAdmin: boolean;
  methodology: SpecPlanMethodology;
  documentText: string;
  extractMeta: { kind: string; fileName: string; pageCount?: number; warnings: string[] };
  allowSubtasks: boolean;
  board: { config?: { bucketOrder?: unknown[] } };
  onEvent: (ev: SpecPlanPipelineEvent) => void | Promise<void>;
  /** Entre fases pesadas (ex.: cancelamento pedido pelo utilizador). */
  shouldCancel?: () => boolean | Promise<boolean>;
  /** Só remapeamento (pula outline + work items). */
  remapOnly?: { workItemsJson: string };
}): Promise<void> {
  const emit = async (ev: SpecPlanPipelineEvent) => {
    await Promise.resolve(input.onEvent(ev));
  };

  const abortIfCancelled = async (): Promise<boolean> => {
    if (!input.shouldCancel) return false;
    const cancel = await Promise.resolve(input.shouldCancel());
    if (!cancel) return false;
    await emit({ event: "error", data: { message: "Análise cancelada.", code: "cancelled" } });
    return true;
  };

  const fallbackOutlineDoc =
    input.documentText.length > SPEC_PLAN_LLM_DOC_CHUNK_CHARS
      ? input.documentText.slice(0, SPEC_PLAN_LLM_DOC_CHUNK_CHARS) +
        "\n\n[... documento truncado para esta fase ...]"
      : input.documentText;

  const modelHintDefault = (
    process.env.TOGETHER_EMBEDDING_MODEL || DEFAULT_GENERAL_EMBEDDING_MODEL
  ).trim();

  let outlineParsed = OutlineLlmSchema.safeParse({ sections: [], keyRequirements: [] });
  let workParsed = WorkItemsLlmSchema.safeParse({ methodologySummary: "", items: [] });

  if (!input.remapOnly) {
    await emit({
      event: "document_parsed",
      data: {
        kind: input.extractMeta.kind,
        fileName: input.extractMeta.fileName,
        pageCount: input.extractMeta.pageCount,
        charCount: input.documentText.length,
        warnings: input.extractMeta.warnings,
      },
    });

    const { chunks, subsampled } = chunkSpecPlainText(input.documentText);
    const chunkCount = chunks.length;
    const avgSize =
      chunkCount > 0
        ? Math.round(chunks.reduce((s, c) => s + c.text.length, 0) / chunkCount)
        : 0;
    await emit({
      event: "chunks_ready",
      data: { chunkCount, avgSize, truncated: subsampled },
    });

    let outlineDocExcerpt = fallbackOutlineDoc;

    /** Documento cabe no limite do outline: análise na íntegra sem embeddings/RAG. */
    const skipRagFullDoc =
      chunkCount > 0 && input.documentText.length <= SPEC_PLAN_LLM_DOC_CHUNK_CHARS;

    if (skipRagFullDoc) {
      outlineDocExcerpt = input.documentText;
      await emit({
        event: "embeddings_ready",
        data: {
          embeddedCount: 0,
          modelHint: modelHintDefault,
          failed: false,
          skippedFullDocFitsLlm: true,
        },
      });
      await emit({
        event: "retrieval_ready",
        data: {
          queries: [],
          chunksUsed: 0,
          preview: [],
          fallback: true,
          skippedFullDocFitsLlm: true,
        },
      });
    } else if (chunkCount > 0) {
      if (await abortIfCancelled()) return;
      const ret = await buildSpecPlanRetrievalContext({
        fileName: input.extractMeta.fileName || "especificação",
        methodology: input.methodology,
        chunks,
      });
      if (await abortIfCancelled()) return;
      if (ret.ok) {
        await emit({
          event: "embeddings_ready",
          data: {
            embeddedCount: ret.embeddedCount,
            modelHint: ret.modelHint,
            failed: false,
          },
        });
        const useRetrieval = ret.chunksUsed > 0;
        outlineDocExcerpt = useRetrieval ? ret.context : fallbackOutlineDoc;
        await emit({
          event: "retrieval_ready",
          data: {
            queries: ret.queries,
            chunksUsed: ret.chunksUsed,
            preview: ret.preview,
            fallback: !useRetrieval,
          },
        });
      } else {
        await emit({
          event: "embeddings_ready",
          data: {
            embeddedCount: 0,
            modelHint: modelHintDefault,
            failed: true,
            failureHint: ret.reason.slice(0, 1200),
          },
        });
        await emit({
          event: "retrieval_ready",
          data: {
            queries: [],
            chunksUsed: 0,
            preview: [],
            fallback: true,
          },
        });
      }
    } else {
      await emit({
        event: "embeddings_ready",
        data: {
          embeddedCount: 0,
          modelHint: modelHintDefault,
          failed: false,
        },
      });
      await emit({
        event: "retrieval_ready",
        data: {
          queries: [],
          chunksUsed: 0,
          preview: [],
          fallback: true,
        },
      });
    }

    if (await abortIfCancelled()) return;

    const oRes = await llmJson({
      org: input.org,
      orgId: input.orgId,
      userId: input.userId,
      isAdmin: input.isAdmin,
      userContent: buildOutlineUserPrompt(outlineDocExcerpt),
      maxOutputTokens: 6144,
    });
    if (!oRes.ok) {
      await emit({ event: "error", data: { message: oRes.message, code: "outline_llm" } });
      return;
    }
    outlineParsed = OutlineLlmSchema.safeParse(oRes.json);
    if (!outlineParsed.success) {
      await emit({
        event: "error",
        data: {
          message: "Outline inválido da IA.",
          code: "outline_schema",
          details: outlineParsed.error.flatten(),
        },
      });
      return;
    }
    await emit({ event: "outline_ready", data: outlineParsed.data as unknown as Record<string, unknown> });

    if (await abortIfCancelled()) return;

    const outlineJsonCompact = compactOutlineForWorkItemsJson(outlineParsed.data);
    await emit({
      event: "work_items_llm_started",
      data: { outlineJsonChars: outlineJsonCompact.length },
    });

    const wRes = await llmJson({
      org: input.org,
      orgId: input.orgId,
      userId: input.userId,
      isAdmin: input.isAdmin,
      userContent: buildWorkItemsUserPrompt({
        methodology: input.methodology,
        outlineJson: outlineJsonCompact,
      }),
      maxOutputTokens: 8192,
    });
    if (!wRes.ok) {
      await emit({ event: "error", data: { message: wRes.message, code: "work_items_llm" } });
      return;
    }
    workParsed = WorkItemsLlmSchema.safeParse(wRes.json);
    if (!workParsed.success) {
      await emit({
        event: "error",
        data: {
          message: "Itens de trabalho inválidos da IA.",
          code: "work_items_schema",
          details: workParsed.error.flatten(),
        },
      });
      return;
    }
    await emit({
      event: "work_items_draft",
      data: workParsed.data as unknown as Record<string, unknown>,
    });
    await emit({
      event: "methodology_applied",
      data: { summary: workParsed.data.methodologySummary, methodology: input.methodology },
    });
  } else {
    try {
      const items = JSON.parse(input.remapOnly.workItemsJson) as unknown;
      workParsed = WorkItemsLlmSchema.safeParse(items);
      if (!workParsed.success) {
        await emit({
          event: "error",
          data: {
            message: "JSON de work items inválido.",
            code: "remap_work_items_schema",
            details: workParsed.error.flatten(),
          },
        });
        return;
      }
    } catch (e) {
      await emit({
        event: "error",
        data: {
          message: "JSON de work items inválido.",
          code: "remap_work_items_parse",
          cause: e instanceof Error ? e.message : String(e),
        },
      });
      return;
    }
  }

  const bucketOrder = Array.isArray(input.board?.config?.bucketOrder) ? input.board.config.bucketOrder : [];
  const bucketsJson = JSON.stringify(
    bucketOrder
      .filter((b: unknown) => b && typeof b === "object")
      .map((b: unknown) => ({
        key: String((b as { key?: string }).key || ""),
        label: String((b as { label?: string }).label || ""),
      }))
      .filter((b) => b.key)
  );

  const workItemsJson = input.remapOnly
    ? compactRemapWorkItemsJsonString(input.remapOnly.workItemsJson)
    : compactWorkItemsForCardsJson(workParsed.data);

  const cardsPrompt = input.remapOnly
    ? buildRemapUserPrompt({
        methodology: input.methodology,
        bucketsJson,
        workItemsJson,
        allowSubtasks: input.allowSubtasks,
      })
    : buildCardsUserPrompt({
        methodology: input.methodology,
        bucketsJson,
        workItemsJson,
        allowSubtasks: input.allowSubtasks,
      });

  if (await abortIfCancelled()) return;

  const workItemCount = workParsed.data.items.length;
  const cardsMaxTokens = cardsMaxOutputTokens(workItemCount);
  await emit({
    event: "cards_llm_started",
    data: {
      workItemCount,
      promptChars: cardsPrompt.length,
      remapOnly: Boolean(input.remapOnly),
    },
  });

  let cRes = await llmJson({
    org: input.org,
    orgId: input.orgId,
    userId: input.userId,
    isAdmin: input.isAdmin,
    userContent: cardsPrompt,
    maxOutputTokens: cardsMaxTokens,
  });
  if (!cRes.ok && cRes.message === "Resposta da IA não é JSON válido.") {
    cRes = await llmJson({
      org: input.org,
      orgId: input.orgId,
      userId: input.userId,
      isAdmin: input.isAdmin,
      userContent: cardsPrompt + CARDS_LLM_JSON_RETRY_SUFFIX,
      maxOutputTokens: cardsMaxTokens,
      temperature: 0.05,
    });
  }
  if (!cRes.ok) {
    await emit({ event: "error", data: { message: cRes.message, code: "cards_llm" } });
    return;
  }
  const cardsParsed = CardsSlimLlmSchema.safeParse(cRes.json);
  if (!cardsParsed.success) {
    await emit({
      event: "error",
      data: {
        message: "Cartões inválidos da IA.",
        code: "cards_schema",
        details: cardsParsed.error.flatten(),
      },
    });
    return;
  }

  const { cardRows, bucketMappingRows } = hydrateSpecPlanCardRows({
    workItems: workParsed.data.items,
    slimRows: cardsParsed.data.cardRows,
    allowSubtasks: input.allowSubtasks,
  });

  await emit({
    event: "bucket_mapping",
    data: { rows: bucketMappingRows },
  });
  await emit({
    event: "cards_preview",
    data: {
      cardRows,
      workItems: workParsed.data,
    },
  });
}
