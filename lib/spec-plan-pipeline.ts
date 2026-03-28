import "server-only";

import type { Organization } from "@/lib/kv-organizations";
import { DEFAULT_DOCS_EMBEDDING_MODEL } from "@/lib/embeddings-together";
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
import { CardsLlmSchema, OutlineLlmSchema, WorkItemsLlmSchema } from "@/lib/spec-plan-schemas";

export type SpecPlanPipelineEvent =
  | { event: "document_parsed"; data: Record<string, unknown> }
  | { event: "chunks_ready"; data: Record<string, unknown> }
  | { event: "embeddings_ready"; data: Record<string, unknown> }
  | { event: "retrieval_ready"; data: Record<string, unknown> }
  | { event: "outline_ready"; data: Record<string, unknown> }
  | { event: "work_items_draft"; data: Record<string, unknown> }
  | { event: "methodology_applied"; data: Record<string, unknown> }
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
}): Promise<{ ok: true; json: unknown } | { ok: false; message: string }> {
  const res = await runOrgLlmChat({
    org: params.org,
    orgId: params.orgId,
    feature: "spec_ai_scope_planner",
    messages: [{ role: "user", content: params.userContent }],
    options: { temperature: 0.15, maxTokens: 8000 },
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
  onEvent: (ev: SpecPlanPipelineEvent) => void;
  /** Só remapeamento (pula outline + work items). */
  remapOnly?: { workItemsJson: string };
}): Promise<void> {
  const send = input.onEvent;

  const fallbackOutlineDoc =
    input.documentText.length > SPEC_PLAN_LLM_DOC_CHUNK_CHARS
      ? input.documentText.slice(0, SPEC_PLAN_LLM_DOC_CHUNK_CHARS) +
        "\n\n[... documento truncado para esta fase ...]"
      : input.documentText;

  const modelHintDefault = (
    process.env.TOGETHER_DOCS_EMBEDDING_MODEL || DEFAULT_DOCS_EMBEDDING_MODEL
  ).trim();

  let outlineParsed = OutlineLlmSchema.safeParse({ sections: [], keyRequirements: [] });
  let workParsed = WorkItemsLlmSchema.safeParse({ methodologySummary: "", items: [] });

  if (!input.remapOnly) {
    send({
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
    send({
      event: "chunks_ready",
      data: { chunkCount, avgSize, truncated: subsampled },
    });

    let outlineDocExcerpt = fallbackOutlineDoc;

    if (chunkCount > 0) {
      const ret = await buildSpecPlanRetrievalContext({
        fileName: input.extractMeta.fileName || "especificação",
        methodology: input.methodology,
        chunks,
      });
      if (ret.ok) {
        send({
          event: "embeddings_ready",
          data: {
            embeddedCount: ret.embeddedCount,
            modelHint: ret.modelHint,
            failed: false,
          },
        });
        const useRetrieval = ret.chunksUsed > 0;
        outlineDocExcerpt = useRetrieval ? ret.context : fallbackOutlineDoc;
        send({
          event: "retrieval_ready",
          data: {
            queries: ret.queries,
            chunksUsed: ret.chunksUsed,
            preview: ret.preview,
            fallback: !useRetrieval,
          },
        });
      } else {
        send({
          event: "embeddings_ready",
          data: {
            embeddedCount: 0,
            modelHint: modelHintDefault,
            failed: true,
            failureHint: ret.reason.slice(0, 1200),
          },
        });
        send({
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
      send({
        event: "embeddings_ready",
        data: {
          embeddedCount: 0,
          modelHint: modelHintDefault,
          failed: false,
        },
      });
      send({
        event: "retrieval_ready",
        data: {
          queries: [],
          chunksUsed: 0,
          preview: [],
          fallback: true,
        },
      });
    }

    const oRes = await llmJson({
      org: input.org,
      orgId: input.orgId,
      userId: input.userId,
      isAdmin: input.isAdmin,
      userContent: buildOutlineUserPrompt(outlineDocExcerpt),
    });
    if (!oRes.ok) {
      send({ event: "error", data: { message: oRes.message, code: "outline_llm" } });
      return;
    }
    outlineParsed = OutlineLlmSchema.safeParse(oRes.json);
    if (!outlineParsed.success) {
      send({
        event: "error",
        data: {
          message: "Outline inválido da IA.",
          code: "outline_schema",
          details: outlineParsed.error.flatten(),
        },
      });
      return;
    }
    send({ event: "outline_ready", data: outlineParsed.data as unknown as Record<string, unknown> });

    const wRes = await llmJson({
      org: input.org,
      orgId: input.orgId,
      userId: input.userId,
      isAdmin: input.isAdmin,
      userContent: buildWorkItemsUserPrompt({
        methodology: input.methodology,
        outlineJson: JSON.stringify(outlineParsed.data),
      }),
    });
    if (!wRes.ok) {
      send({ event: "error", data: { message: wRes.message, code: "work_items_llm" } });
      return;
    }
    workParsed = WorkItemsLlmSchema.safeParse(wRes.json);
    if (!workParsed.success) {
      send({
        event: "error",
        data: {
          message: "Itens de trabalho inválidos da IA.",
          code: "work_items_schema",
          details: workParsed.error.flatten(),
        },
      });
      return;
    }
    send({
      event: "work_items_draft",
      data: workParsed.data as unknown as Record<string, unknown>,
    });
    send({
      event: "methodology_applied",
      data: { summary: workParsed.data.methodologySummary, methodology: input.methodology },
    });
  } else {
    try {
      const items = JSON.parse(input.remapOnly.workItemsJson) as unknown;
      workParsed = WorkItemsLlmSchema.safeParse(items);
      if (!workParsed.success) {
        send({
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
      send({
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
    ? input.remapOnly.workItemsJson
    : JSON.stringify(workParsed.data);

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

  const cRes = await llmJson({
    org: input.org,
    orgId: input.orgId,
    userId: input.userId,
    isAdmin: input.isAdmin,
    userContent: cardsPrompt,
  });
  if (!cRes.ok) {
    send({ event: "error", data: { message: cRes.message, code: "cards_llm" } });
    return;
  }
  const cardsParsed = CardsLlmSchema.safeParse(cRes.json);
  if (!cardsParsed.success) {
    send({
      event: "error",
      data: {
        message: "Cartões inválidos da IA.",
        code: "cards_schema",
        details: cardsParsed.error.flatten(),
      },
    });
    return;
  }

  send({
    event: "bucket_mapping",
    data: { rows: cardsParsed.data.bucketMappingPreview },
  });
  send({
    event: "cards_preview",
    data: {
      cardRows: cardsParsed.data.cardRows,
      workItems: workParsed.data,
    },
  });
}
