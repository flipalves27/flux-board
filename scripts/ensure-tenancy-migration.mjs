#!/usr/bin/env node
/**
 * Executa o backfill de `orgId` (coleção `app_migrations` + updateMany) fora do caminho
 * crítico do primeiro pedido serverless. Idempotente: se o marcador já existir, não faz nada.
 *
 * Uso (CI / deploy / operador):
 *   MONGODB_URI="..." [MONGODB_DB="..."] node scripts/ensure-tenancy-migration.mjs
 *
 * Marcador: app_migrations._id === "tenancy_orgid_backfill_v1" (alinhado a lib/kv-organizations.ts).
 */
import { MongoClient } from "mongodb";

const TENANCY_ORGID_BACKFILL_MIGRATION_ID = "tenancy_orgid_backfill_v1";
const DEFAULT_ORG_ID = "org_default";

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!uri) {
  console.error("Defina MONGODB_URI ou MONGO_URI.");
  process.exit(1);
}

const dbName = process.env.MONGODB_DB;

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = dbName ? client.db(dbName) : client.db();

  const migrations = db.collection("app_migrations");
  const already = await migrations.findOne({ _id: TENANCY_ORGID_BACKFILL_MIGRATION_ID });
  if (already) {
    console.info(`[ensure-tenancy-migration] já aplicada (${TENANCY_ORGID_BACKFILL_MIGRATION_ID}).`);
    await client.close();
    return;
  }

  const orgs = db.collection("organizations");
  const orgDoc = await orgs.findOne({ _id: DEFAULT_ORG_ID });
  if (!orgDoc) {
    await orgs.insertOne({
      _id: DEFAULT_ORG_ID,
      name: "Default organization",
      slug: "default",
      ownerId: "admin",
      plan: "business",
      maxUsers: 1,
      maxBoards: 3,
      createdAt: new Date().toISOString(),
    });
    console.info("[ensure-tenancy-migration] organizations default criada.");
  }

  const users = await db
    .collection("users")
    .updateMany({ $or: [{ orgId: { $exists: false } }, { orgId: null }] }, { $set: { orgId: DEFAULT_ORG_ID } });
  const boards = await db
    .collection("boards")
    .updateMany({ $or: [{ orgId: { $exists: false } }, { orgId: null }] }, { $set: { orgId: DEFAULT_ORG_ID } });
  const userBoards = await db.collection("user_boards").updateMany(
    { $or: [{ orgId: { $exists: false } }, { orgId: null }] },
    { $set: { orgId: DEFAULT_ORG_ID } }
  );

  await migrations.updateOne(
    { _id: TENANCY_ORGID_BACKFILL_MIGRATION_ID },
    { $set: { completedAt: new Date().toISOString() } },
    { upsert: true }
  );

  console.info("[ensure-tenancy-migration] concluída.", {
    usersModified: users.modifiedCount,
    boardsModified: boards.modifiedCount,
    userBoardsModified: userBoards.modifiedCount,
  });

  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
