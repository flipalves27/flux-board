import type { SpecPlanRunDocument } from "@/lib/spec-plan-runs";

export function serializeSpecPlanRunSummary(doc: SpecPlanRunDocument) {
  return {
    id: doc._id.toHexString(),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    status: doc.status,
    methodology: doc.methodology,
    remapOnly: doc.remapOnly,
    sourceSummary: doc.sourceSummary,
    previewCount: doc.preview.length,
    streamError: doc.streamError,
  };
}

export function serializeSpecPlanRunFull(doc: SpecPlanRunDocument) {
  return {
    ...serializeSpecPlanRunSummary(doc),
    boardId: doc.boardId,
    phases: doc.phases,
    logs: doc.logs,
    docReadMeta: doc.docReadMeta,
    outlineSummary: doc.outlineSummary,
    methodologySummary: doc.methodologySummary,
    workItemsPayload: doc.workItemsPayload,
    preview: doc.preview,
    streamErrorDetail: doc.streamErrorDetail,
    cancelRequested: Boolean(doc.cancelRequested),
  };
}
