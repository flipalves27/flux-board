import type { Db } from "mongodb";
import type { BoardData } from "@/lib/kv-boards";
import { listBoardsForOrgMongo, insertAnomalyAlertsAndNotify } from "@/lib/anomaly-service";
import { getOrganizationById, type Organization } from "@/lib/kv-organizations";
import { canUseFeature } from "@/lib/plan-gates";
import { isMongoConfigured } from "@/lib/mongo";
import { computeCrossBoardSuggestions, syncEmbeddingsForOrg } from "@/lib/card-dependency-pipeline";
import { listCrossDependencyLinksForOrg } from "@/lib/kv-card-dependencies";
import { buildCrossBoardBlockerAlerts } from "@/lib/card-dependency-risk";

export type CardDependencyCronResult = {
  orgId: string;
  embeddingsUpdated: number;
  suggestionPairs: number;
  riskAlerts: number;
  skipped?: string;
};

export async function runCardDependencyJobForOrg(args: {
  db: Db;
  orgId: string;
  org: Organization | null;
  nowMs: number;
}): Promise<CardDependencyCronResult> {
  const { db, orgId, org, nowMs } = args;

  if (org && !canUseFeature(org, "portfolio_export")) {
    return { orgId, embeddingsUpdated: 0, suggestionPairs: 0, riskAlerts: 0, skipped: "plan" };
  }

  const boards = await listBoardsForOrgMongo(orgId, db);
  if (!boards.length) {
    return { orgId, embeddingsUpdated: 0, suggestionPairs: 0, riskAlerts: 0, skipped: "no_boards" };
  }

  const emb = await syncEmbeddingsForOrg(orgId, boards);
  const nSugg = await computeCrossBoardSuggestions(orgId, boards);

  const links = await listCrossDependencyLinksForOrg(orgId, { minConfidence: 0 });
  const crossLinks = links.filter(
    (l) =>
      l.sourceBoardId !== l.targetBoardId &&
      (l.kind === "depends_on" || l.kind === "blocks" || l.kind === "related_to")
  );

  const alerts = buildCrossBoardBlockerAlerts(boards, crossLinks, nowMs);
  if (alerts.length) {
    await insertAnomalyAlertsAndNotify({
      db,
      orgId,
      org,
      boards,
      alerts,
      nowMs,
    });
  }

  return {
    orgId,
    embeddingsUpdated: emb.updated,
    suggestionPairs: nSugg,
    riskAlerts: alerts.length,
  };
}

export async function runCardDependencyJobAllOrgs(nowMs: number): Promise<{
  processedOrgs: number;
  results: CardDependencyCronResult[];
}> {
  if (!isMongoConfigured()) {
    return { processedOrgs: 0, results: [] };
  }
  const { getDb } = await import("@/lib/mongo");
  const db = await getDb();
  const orgIds = (await db.collection("boards").distinct("orgId")) as string[];

  const results: CardDependencyCronResult[] = [];
  for (const orgId of orgIds) {
    if (!orgId) continue;
    try {
      const org = await getOrganizationById(orgId);
      const r = await runCardDependencyJobForOrg({ db, orgId, org, nowMs });
      results.push(r);
    } catch (e) {
      console.error("[card-dependencies-cron] org", orgId, e);
      results.push({
        orgId,
        embeddingsUpdated: 0,
        suggestionPairs: 0,
        riskAlerts: 0,
        skipped: "error",
      });
    }
  }

  return { processedOrgs: results.length, results };
}
