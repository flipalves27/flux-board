/**
 * Stub de contrato para MCP Hub (servidor Flux-Board + consumo de MCPs externos).
 * Implementação completa: transporte stdio/SSE, OAuth por org, catálogo de tools.
 */

export const MCP_FLUX_BOARD_TOOLS_MANIFEST_VERSION = "0.1.0";

export type McpToolStub = {
  name: string;
  description: string;
};

export const MCP_FLUX_BOARD_TOOLS_STUB: McpToolStub[] = [
  { name: "list_boards", description: "Lista boards da organização autenticada." },
  { name: "get_board_snapshot", description: "Snapshot compacto de cards e colunas." },
  { name: "search_cards", description: "Busca textual em títulos/descrições." },
];
