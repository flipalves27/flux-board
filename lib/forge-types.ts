/** Flux Forge — shared document types (MongoDB + API). */

export type ForgeTier = "oneshot" | "tested" | "autonomous";

export type ForgeJobStatus =
  | "queued"
  | "indexing"
  | "planning"
  | "plan_review"
  | "generating"
  | "testing"
  | "pr_opened"
  | "merged"
  | "failed"
  | "cancelled";

export type ForgeTimelineEntry = {
  phase: string;
  at: string;
  detail?: string;
  ok?: boolean;
};

export type ForgeAttempt = {
  n: number;
  at: string;
  reason?: string;
};

export type ForgeCiCheck = {
  name: string;
  state: "pending" | "success" | "failure" | "skipped";
  url?: string;
};

export type ForgeJob = {
  _id: string;
  orgId: string;
  createdByUserId: string;
  boardId?: string | null;
  cardIds: string[];
  tier: ForgeTier;
  status: ForgeJobStatus;
  repoFullName?: string | null;
  repoId?: string | null;
  branchBase?: string | null;
  branchForge?: string | null;
  batchId?: string | null;
  planMarkdown?: string | null;
  diffText?: string | null;
  prNumber?: number | null;
  prUrl?: string | null;
  workflowRunUrl?: string | null;
  errorMessage?: string | null;
  timeline: ForgeTimelineEntry[];
  ragChunkIds?: string[];
  attempts?: ForgeAttempt[];
  ciStatus?: ForgeCiCheck[];
  usage?: { inputTokens: number; outputTokens: number; usd?: number };
  /** When true, pipeline waits for POST /approve-plan before generating. */
  requirePlanApproval?: boolean;
  planApprovedAt?: string | null;
  cancelRequested?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ForgeRepoChunk = {
  _id: string;
  orgId: string;
  repoFullName: string;
  commitSha: string;
  path: string;
  content: string;
  tokenEstimate?: number;
  embedding?: number[] | null;
  createdAt: string;
};

export type ForgePolicy = {
  _id: string;
  orgId: string;
  /** null = org default */
  repoId?: string | null;
  defaultLanguage?: string | null;
  blockedPaths?: string[];
  maxFilesPerPr?: number;
  maxLocPerPr?: number;
  redactPiiRegex?: string | null;
  requireHumanPlanApproval?: boolean;
  outboundWebhookUrl?: string | null;
  defaultModelOverride?: string | null;
  updatedAt: string;
};

export type ForgeInsightsSnapshot = {
  totalRuns: number;
  mergedRuns: number;
  failedRuns: number;
  avgDurationSec: number | null;
  totalUsd: number;
  byRepo: Record<string, { runs: number; merged: number; failed: number }>;
  byDay: Record<string, { runs: number; success: number }>;
};
