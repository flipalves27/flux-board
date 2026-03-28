/** Tamanho máximo do arquivo enviado (PDF/DOCX). */
export const SPEC_PLAN_MAX_FILE_BYTES = 8 * 1024 * 1024;

/** Texto normalizado máximo após extração (caracteres). */
export const SPEC_PLAN_MAX_TEXT_CHARS = 100_000;

/** Trecho máximo enviado ao LLM na fase de outline (caracteres). */
export const SPEC_PLAN_LLM_DOC_CHUNK_CHARS = 52_000;
