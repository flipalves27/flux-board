/** Tamanho máximo do arquivo enviado (PDF/DOCX). */
export const SPEC_PLAN_MAX_FILE_BYTES = 8 * 1024 * 1024;

/** Texto normalizado máximo após extração (caracteres). */
export const SPEC_PLAN_MAX_TEXT_CHARS = 100_000;

/**
 * Trecho máximo enviado ao LLM na fase de outline (caracteres).
 * Documentos até este tamanho não usam RAG: o outline recebe o texto integral.
 */
export const SPEC_PLAN_LLM_DOC_CHUNK_CHARS = 52_000;

/** Chunking de texto plano antes dos embeddings (caracteres alvo por chunk). */
export const SPEC_PLAN_CHUNK_TARGET_CHARS = 2000;

/** Sobreposição entre chunks consecutivos (caracteres). */
export const SPEC_PLAN_CHUNK_OVERLAP = 200;

/** Teto de chunks após chunking (subamostragem estratificada se exceder). */
export const SPEC_PLAN_MAX_CHUNKS = 200;

/** Top-K por query de recuperação semântica. */
export const SPEC_PLAN_RETRIEVAL_TOP_K = 12;

/** Orçamento máximo de caracteres do contexto montado para o outline (inclui cabeçalhos). */
export const SPEC_PLAN_RETRIEVAL_CONTEXT_MAX_CHARS = 40_000;

/**
 * Pedidos HTTP de embeddings em paralelo (cada um com até SPEC_PLAN_EMBED_BATCH textos).
 */
export const SPEC_PLAN_EMBED_CONCURRENCY = 8;

/** Tamanho do lote de embeddings (Together). Lotes grandes + texto longo podem falhar por limite de pedido. */
export const SPEC_PLAN_EMBED_BATCH = 12;
