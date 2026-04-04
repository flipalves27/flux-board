export type SpecPlanPhaseKey =
  | "parse"
  | "chunks"
  | "embeddings"
  | "retrieval"
  | "outline"
  | "work"
  | "cards";

export type SpecPlanPhaseState = "pending" | "running" | "done" | "error";

export type SpecPlanRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type SpecPlanPreviewRow = {
  title: string;
  desc: string;
  bucketKey: string;
  priority: string;
  progress: string;
  tags: string[];
  rationale: string;
  blockedByTitles: string[];
  subtasks: { title: string }[];
  storyPoints: number | null;
  serviceClass: string | null;
};

export type SpecPlanRunLogEntry = {
  id: string;
  timestamp: number;
  level: "info" | "success" | "error";
  message: string;
  detail?: string;
};

export type SpecPlanDocReadMeta = {
  fileName: string;
  kind: string;
  charCount?: number;
  pageCount?: number;
  warnings: string[];
};

export type SpecPlanRunUiState = {
  phases: Record<SpecPlanPhaseKey, SpecPlanPhaseState>;
  docReadMeta: SpecPlanDocReadMeta | null;
  outlineSummary: string | null;
  methodologySummary: string | null;
  workItemsPayload: string;
  preview: SpecPlanPreviewRow[];
  streamError: string | null;
  streamErrorDetail: string | null;
  logs: SpecPlanRunLogEntry[];
};
