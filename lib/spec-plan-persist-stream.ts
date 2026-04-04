import "server-only";

import type { SpecPlanMethodology } from "@/lib/spec-plan-schemas";
import { applySpecPlanSseEvent, createInitialSpecPlanRunState } from "@/lib/spec-plan-run-accumulator";
import type { SpecPlanRunUiState } from "@/lib/spec-plan-run-types";
import { isMongoConfigured } from "@/lib/mongo";
import { insertSpecPlanRun } from "@/lib/spec-plan-runs";

export function createStreamAccumulator(remapOnly: boolean): SpecPlanRunUiState {
  return createInitialSpecPlanRunState(remapOnly);
}

export function foldStreamEvent(
  acc: SpecPlanRunUiState,
  event: string,
  data: Record<string, unknown>,
  remapOnly: boolean
): SpecPlanRunUiState {
  return applySpecPlanSseEvent(acc, event, data, remapOnly);
}

export async function persistSpecPlanRunSnapshot(args: {
  orgId: string;
  boardId: string;
  userId: string;
  methodology: SpecPlanMethodology;
  remapOnly: boolean;
  sourceSummary: string;
  acc: SpecPlanRunUiState;
}): Promise<void> {
  if (!isMongoConfigured()) return;
  const failed =
    Boolean(args.acc.streamError) ||
    args.acc.phases.cards === "error" ||
    (args.acc.phases.parse === "error" && !args.remapOnly);
  const status = failed ? "failed" : "completed";
  await insertSpecPlanRun({
    orgId: args.orgId,
    boardId: args.boardId,
    userId: args.userId,
    status,
    methodology: args.methodology,
    remapOnly: args.remapOnly,
    sourceSummary: args.sourceSummary,
    phases: args.acc.phases,
    logs: args.acc.logs,
    docReadMeta: args.acc.docReadMeta,
    outlineSummary: args.acc.outlineSummary,
    methodologySummary: args.acc.methodologySummary,
    workItemsPayload: args.acc.workItemsPayload,
    preview: args.acc.preview,
    streamError: args.acc.streamError,
    streamErrorDetail: args.acc.streamErrorDetail,
  });
}
