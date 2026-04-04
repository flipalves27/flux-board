import "server-only";

import type { ObjectId } from "mongodb";
import type { BoardData } from "@/lib/kv-boards";
import { applySpecPlanSseEvent, createInitialSpecPlanRunState } from "@/lib/spec-plan-run-accumulator";
import type { Organization } from "@/lib/kv-organizations";
import { runSpecPlanPipeline } from "@/lib/spec-plan-pipeline";
import type { SpecPlanMethodology } from "@/lib/spec-plan-schemas";
import { getSpecPlanRunCancelRequested, updateSpecPlanRun } from "@/lib/spec-plan-runs";

type PayloadSlice = { id: string; isAdmin: boolean; orgId: string };

export async function executeSpecPlanRunInBackground(args: {
  runId: ObjectId;
  orgId: string;
  boardId: string;
  payload: PayloadSlice;
  org: Organization;
  board: BoardData;
  methodology: SpecPlanMethodology;
  remapOnly: boolean;
  documentText: string;
  extractMeta: { kind: string; fileName: string; pageCount?: number; warnings: string[] };
  workItemsJson: string;
  allowSubtasks: boolean;
}): Promise<void> {
  const { runId, orgId, remapOnly } = args;
  let acc = createInitialSpecPlanRunState(remapOnly);

  const persistAcc = async () => {
    await updateSpecPlanRun(runId, orgId, {
      phases: acc.phases,
      logs: acc.logs,
      docReadMeta: acc.docReadMeta,
      outlineSummary: acc.outlineSummary,
      methodologySummary: acc.methodologySummary,
      workItemsPayload: acc.workItemsPayload,
      preview: acc.preview,
      streamError: acc.streamError,
      streamErrorDetail: acc.streamErrorDetail,
    });
  };

  const applyLocal = (event: string, data: Record<string, unknown>) => {
    acc = applySpecPlanSseEvent(acc, event, data, remapOnly);
  };

  try {
    applyLocal("status", { phase: "started", remapOnly });
    await persistAcc();

    await runSpecPlanPipeline({
      org: args.org,
      orgId: args.orgId,
      userId: args.payload.id,
      isAdmin: Boolean(args.payload.isAdmin),
      methodology: args.methodology,
      documentText: args.documentText,
      extractMeta: args.extractMeta,
      allowSubtasks: args.allowSubtasks,
      board: args.board,
      remapOnly: remapOnly ? { workItemsJson: args.workItemsJson } : undefined,
      shouldCancel: () => getSpecPlanRunCancelRequested(runId, orgId),
      onEvent: async (ev) => {
        const data = ev.data as Record<string, unknown>;
        applyLocal(ev.event, data);
        await persistAcc();
      },
    });

    applyLocal("done", { ok: true });
    await persistAcc();

    const cancelled =
      acc.streamError?.includes("cancelad") ||
      (typeof acc.streamErrorDetail === "string" && acc.streamErrorDetail.includes('"code":"cancelled"'));
    const failed =
      Boolean(acc.streamError) || acc.phases.cards === "error" || (acc.phases.parse === "error" && !remapOnly);

    await updateSpecPlanRun(runId, orgId, {
      status: cancelled ? "cancelled" : failed ? "failed" : "completed",
      phases: acc.phases,
      logs: acc.logs,
      docReadMeta: acc.docReadMeta,
      outlineSummary: acc.outlineSummary,
      methodologySummary: acc.methodologySummary,
      workItemsPayload: acc.workItemsPayload,
      preview: acc.preview,
      streamError: acc.streamError,
      streamErrorDetail: acc.streamErrorDetail,
    });
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    applyLocal("error", {
      message: e.message || "Erro interno",
      code: "pipeline_uncaught",
      cause: e.message,
      stack: process.env.NODE_ENV === "development" ? e.stack : undefined,
    });
    await updateSpecPlanRun(runId, orgId, {
      status: "failed",
      phases: acc.phases,
      logs: acc.logs,
      docReadMeta: acc.docReadMeta,
      outlineSummary: acc.outlineSummary,
      methodologySummary: acc.methodologySummary,
      workItemsPayload: acc.workItemsPayload,
      preview: acc.preview,
      streamError: acc.streamError,
      streamErrorDetail: acc.streamErrorDetail,
    });
  }
}
