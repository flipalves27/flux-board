#!/usr/bin/env node
/**
 * Migra boards legados `b_reborn_<orgId>` → `b_default_<orgId>` e atualiza referências no MongoDB.
 * O prefixo legado mantém-se no filtro até todas as orgs migrarem (contrato de dados).
 *
 * Uso:
 *   MONGODB_URI="..." [MONGODB_DB="..."] node scripts/migrate-legacy-board-ids.mjs
 */
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!uri) {
  console.error("Defina MONGODB_URI ou MONGO_URI.");
  process.exit(1);
}

const dbName = process.env.MONGODB_DB;

function newBoardId(orgId) {
  return `b_default_${orgId}`;
}

/** @param {import('mongodb').Db} db */
async function updateSatellites(db, orgId, oldId, newId) {
  const ub = db.collection("user_boards");
  const rows = await ub.find({ orgId, boardIds: oldId }).toArray();
  for (const row of rows) {
    const next = [...new Set((row.boardIds || []).map((b) => (b === oldId ? newId : b)))];
    await ub.updateOne({ _id: row._id, orgId }, { $set: { boardIds: next } });
  }

  await db.collection("board_members").updateMany({ orgId, boardId: oldId }, { $set: { boardId: newId } });
  await db.collection("sprints").updateMany({ orgId, boardId: oldId }, { $set: { boardId: newId } });
  await db.collection("async_standup_entries").updateMany({ orgId, boardId: oldId }, { $set: { boardId: newId } });
  await db.collection("time_entries").updateMany({ orgId, boardId: oldId }, { $set: { boardId: newId } });
  await db.collection("board_copilot_chats").updateMany({ orgId, boardId: oldId }, { $set: { boardId: newId } });
  await db.collection("board_activity").updateMany({ orgId, boardId: oldId }, { $set: { boardId: newId } });
  await db.collection("portal_links").updateMany({ orgId, boardId: oldId }, { $set: { boardId: newId } });
  await db.collection("board_embeds").updateMany({ orgId, boardId: oldId }, { $set: { boardId: newId } });
  await db.collection("intake_forms").updateMany({ orgId, boardId: oldId }, { $set: { boardId: newId } });
  await db.collection("okrs_key_results").updateMany({ orgId, linkedBoardId: oldId }, { $set: { linkedBoardId: newId } });

  const autoCol = db.collection("board_automations");
  const autoDoc = await autoCol.findOne({ _id: oldId, orgId });
  if (autoDoc) {
    const { _id: _drop, ...rest } = autoDoc;
    await autoCol.replaceOne({ _id: newId, orgId }, { _id: newId, ...rest }, { upsert: true });
    await autoCol.deleteOne({ _id: oldId, orgId });
  }
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = dbName ? client.db(dbName) : client.db();

  const boards = db.collection("boards");
  const cursor = boards.find({ _id: { $regex: /^b_reborn_/ } });
  const list = await cursor.toArray();

  if (!list.length) {
    console.log("Nenhum documento com _id b_reborn_* encontrado. Nada a fazer.");
    await client.close();
    return;
  }

  let migrated = 0;
  let skipped = 0;

  for (const doc of list) {
    const oldId = doc._id;
    const orgId = doc.orgId;
    if (!orgId || typeof orgId !== "string") {
      console.warn(`Ignorando board ${oldId}: orgId inválido.`);
      skipped++;
      continue;
    }
    const nid = newBoardId(orgId);
    if (oldId === nid) {
      skipped++;
      continue;
    }

    const newExists = await boards.findOne({ _id: nid, orgId });
    const oldStill = await boards.findOne({ _id: oldId, orgId });

    if (!oldStill) {
      skipped++;
      continue;
    }

    if (newExists) {
      console.error(
        `Conflito: já existe board ${nid} na org ${orgId} e ainda existe ${oldId}. Resolva manualmente antes de prosseguir.`
      );
      skipped++;
      continue;
    }

    const { _id: _old, ...rest } = doc;
    const nextName = rest.name === "Board-Reborn" ? "Board principal" : rest.name;
    const newDoc = { _id: nid, ...rest, name: nextName };

    await boards.insertOne(newDoc);
    await updateSatellites(db, orgId, oldId, nid);
    await boards.deleteOne({ _id: oldId, orgId });

    console.log(`Migrado ${oldId} → ${nid} (org ${orgId})`);
    migrated++;
  }

  console.log(`\nConcluído: ${migrated} migrado(s), ${skipped} ignorado(s)/conflito(s).`);
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
