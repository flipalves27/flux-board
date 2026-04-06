#!/usr/bin/env node
/**
 * Referência para recolher explain("executionStats") em staging (copiar para mongosh).
 * Não conecta ao Mongo — só imprime queries/agregações alinhadas ao código em lib/kv-boards.ts.
 */
const lines = [
  "// Substitua ORG_ID e BOARD_ID por valores reais da staging.",
  "",
  "// 1) Board por org (índice { orgId: 1, _id: 1 })",
  'db.boards.find({ orgId: "ORG_ID", _id: "BOARD_ID" }).explain("executionStats")',
  "",
  "// 2) Contagem de boards da org (billing / GET /api/boards)",
  'db.boards.countDocuments({ orgId: "ORG_ID" })',
  'db.boards.find({ orgId: "ORG_ID" }).explain("executionStats") // opcional; preferir countDocuments acima',
  "",
  "// 3) Agregação tipo getBoardListRowsByIds (amostra)",
  `db.boards.aggregate([
  { $match: { orgId: "ORG_ID", _id: { $in: ["BOARD_ID_A", "BOARD_ID_B"] } } },
  { $project: {
      _id: 1, name: 1, ownerId: 1, orgId: 1, boardMethodology: 1, clientLabel: 1, lastUpdated: 1, config: 1,
      cards: { $map: { input: { $ifNull: ["$cards", []] }, as: "c", in: {
        bucket: "$$c.bucket", priority: "$$c.priority", progress: "$$c.progress", dueDate: "$$c.dueDate"
      } } }
  } }
]).explain("executionStats")`,
  "",
  "// 4) user_boards org-wide (lista de ids — comparar custo com countDocuments em boards)",
  `db.user_boards.aggregate([
  { $match: { orgId: "ORG_ID" } },
  { $unwind: { path: "$boardIds", preserveNullAndEmptyArrays: false } },
  { $group: { _id: "$boardIds" } }
]).explain("executionStats")`,
  "",
];

console.log(lines.join("\n"));
