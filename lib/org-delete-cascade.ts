import type { Db } from "mongodb";
import { COL_ANOMALY_ALERTS, COL_ANOMALY_NOTIFY_DEDUPE, COL_ANOMALY_RUNS, COL_ANOMALY_SNAPSHOTS } from "@/lib/anomaly-collections";
import { deleteBoard } from "@/lib/kv-boards";
import { COL_BOARD_ACTIVITY } from "@/lib/kv-board-activity";
import { COL_CARD_CROSS_LINKS, COL_CARD_DEP_SUGGESTIONS, COL_CARD_TEXT_EMBEDDINGS } from "@/lib/kv-card-dependencies";
import { COL_BOARD_WEEKLY_SENTIMENT } from "@/lib/board-weekly-sentiment";
import { COL_DOC_CHUNKS } from "@/lib/kv-doc-chunks";
import { getOrganizationById, DEFAULT_ORG_ID, type Organization } from "@/lib/kv-organizations";
import { SPEC_PLAN_RUNS_COLLECTION } from "@/lib/spec-plan-runs";
import { deleteUser } from "@/lib/kv-users";
import { getDb, isMongoConfigured } from "@/lib/mongo";

const COL_BOARDS = "boards";
const COL_ORGS = "organizations";
const COL_USERS = "users";
const COL_USER_BOARDS = "user_boards";
const COL_BOARD_MEMBERS = "board_members";
const COL_COMMENTS = "card_comments";
const COL_STANDUP = "async_standup_entries";
const COL_TIME_ENTRIES = "time_entries";
const COL_SPRINTS = "sprints";
const COL_PI = "program_increments";
const COL_CONNECTIONS = "integration_connections";
const COL_EVENT_LOGS = "integration_event_logs";
const COL_PUSH_SUBS = "push_subscriptions";
const COL_PUSH_OUTBOX = "push_outbox";
const COL_PUBLIC_API_TOKENS = "public_api_tokens";
const COL_AUTOMATION_LOGS = "board_automation_logs";
const COL_COPILOT_CHATS = "board_copilot_chats";
const COL_CARD_TEMPLATES = "card_templates";
const COL_INVITES = "organization_invites";
const COL_INTAKE_FORMS = "intake_forms";
const COL_SUBS = "webhook_subscriptions";
const COL_OUTBOX = "webhook_outbox";
const COL_LOGS = "webhook_delivery_logs";
const COL_OBJECTIVES = "okrs_objectives";
const COL_KEY_RESULTS = "okrs_key_results";
const COL_BOARD_AUTOMATIONS = "board_automations";
const COL_DOCS = "docs";
const COL_PORTAL_INDEX = "portal_links";
/** Execuções de agente / digest / feedback / spec plan — escopo org (não removidos por `deleteBoard`). */
const COL_AGENT_RUNS = "agent_runs";
const COL_DIGEST_SEND_LOCK = "digest_daily_send_lock";
const COL_AUDIT_EVENTS = "audit_events";
const COL_WORKSPACE_FLUXY_CHATS = "workspace_fluxy_chats";
const COL_TEAM_MEMBERS = "team_members";
const COL_AI_FEEDBACK_EVENTS = "ai_feedback_events";

async function deleteManyByOrgId(db: Db, collection: string, orgId: string): Promise<void> {
  try {
    await db.collection(collection).deleteMany({ orgId });
  } catch {
    // coleção pode não existir em ambientes antigos
  }
}

/**
 * Remove organização e dados associados (MongoDB). Não permite apagar `org_default`.
 */
export async function deleteOrganizationCascade(orgId: string, actorUserId: string): Promise<void> {
  if (!isMongoConfigured()) {
    throw new Error("Exclusão de organização requer MongoDB configurado.");
  }
  if (orgId === DEFAULT_ORG_ID) {
    throw new Error("Não é possível excluir a organização padrão do sistema.");
  }

  const existing = await getOrganizationById(orgId);
  if (!existing) {
    throw new Error("Organização não encontrada.");
  }

  const db = await getDb();

  const boardDocs = await db.collection(COL_BOARDS).find({ orgId }).project({ _id: 1 }).toArray();
  for (const b of boardDocs) {
    const boardId = String(b._id);
    await deleteBoard(boardId, orgId, actorUserId, true);
  }

  const collectionsWithOrgId: string[] = [
    COL_BOARD_MEMBERS,
    COL_COMMENTS,
    COL_STANDUP,
    COL_TIME_ENTRIES,
    COL_SPRINTS,
    COL_PI,
    COL_CONNECTIONS,
    COL_EVENT_LOGS,
    COL_PUSH_SUBS,
    COL_PUSH_OUTBOX,
    COL_PUBLIC_API_TOKENS,
    COL_AUTOMATION_LOGS,
    COL_COPILOT_CHATS,
    COL_CARD_TEMPLATES,
    COL_INVITES,
    COL_INTAKE_FORMS,
    COL_SUBS,
    COL_OUTBOX,
    COL_LOGS,
    COL_OBJECTIVES,
    COL_KEY_RESULTS,
    COL_BOARD_AUTOMATIONS,
    COL_BOARD_ACTIVITY,
    COL_ANOMALY_SNAPSHOTS,
    COL_ANOMALY_RUNS,
    COL_ANOMALY_ALERTS,
    COL_ANOMALY_NOTIFY_DEDUPE,
    COL_USER_BOARDS,
    COL_AGENT_RUNS,
    COL_DIGEST_SEND_LOCK,
    COL_AUDIT_EVENTS,
    COL_BOARD_WEEKLY_SENTIMENT,
    COL_WORKSPACE_FLUXY_CHATS,
    COL_TEAM_MEMBERS,
    COL_AI_FEEDBACK_EVENTS,
    SPEC_PLAN_RUNS_COLLECTION,
  ];

  for (const col of collectionsWithOrgId) {
    await deleteManyByOrgId(db, col, orgId);
  }

  await deleteManyByOrgId(db, COL_CARD_CROSS_LINKS, orgId);
  await deleteManyByOrgId(db, COL_CARD_DEP_SUGGESTIONS, orgId);
  await deleteManyByOrgId(db, COL_CARD_TEXT_EMBEDDINGS, orgId);

  await deleteManyByOrgId(db, COL_DOC_CHUNKS, orgId);
  await deleteManyByOrgId(db, COL_DOCS, orgId);
  await deleteManyByOrgId(db, COL_PORTAL_INDEX, orgId);

  const userDocs = await db.collection(COL_USERS).find({ orgId }).project({ _id: 1 }).toArray();
  for (const u of userDocs) {
    const uid = String(u._id);
    await deleteUser(uid, orgId);
  }

  await db.collection<Organization>(COL_ORGS).deleteOne({ _id: orgId });
}
