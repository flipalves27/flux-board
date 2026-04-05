/**
 * Fase 4 (opcional) — normalização de `cards` para coleção separada ou stats denormalizados.
 *
 * **Problema:** com cards embutidos em `boards`, projeções Mongo ainda leem o documento grande do disco;
 * só uma coleção `board_cards` (ou `cards`) remove I/O de cards não usados de forma fundamental.
 *
 * **Opção A — coleção `board_cards`**
 * - Documento sugerido: `{ orgId, boardId, cardId, ...campos do card atual, updatedAt }`.
 * - Índices: `{ orgId: 1, boardId: 1 }`, `{ orgId: 1, boardId: 1, cardId: 1 }` unique.
 * - Leitura Kanban: `find({ orgId, boardId })` com projeção por necessidade; paginação opcional.
 * - Escrita: atualizar card por `_id` composto ou `replaceOne` com filtro; manter `boards` só com metadados
 *   (nome, config, portal, versão, `cardCount`, `lastUpdated`).
 * - Migração: job offline que faz `bulkWrite` a partir de `boards.cards`; período dual-read (ler cards da coleção
 *   nova se flag `board.cardsNormalized === true`, senão legado) até backfill completo.
 *
 * **Opção B — stats denormalizados (mais leve)**
 * - Campos em `boards`: `portfolioStats`, `cardCount`, `openCardCount`, atualizados em cada PUT de board
 *   (ou debounce) para dashboards não iterarem `cards`.
 * - Menos ganho em I/O do Kanban completo, mas barato para relatórios org-wide.
 *
 * **Riscos:** consistência transacional card + board; tamanho de batch em updates massivos; reindexar dependências
 * e automações que assumem array embutido.
 */
export const BOARD_CARDS_MIGRATION_DESIGN_VERSION = 1;
