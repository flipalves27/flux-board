import {
  SPEC_PLAN_CHUNK_OVERLAP,
  SPEC_PLAN_CHUNK_TARGET_CHARS,
  SPEC_PLAN_MAX_CHUNKS,
} from "@/lib/spec-plan-constants";

export type SpecPlanChunk = {
  chunkId: string;
  chunkIndex: number;
  charStart: number;
  charEnd: number;
  text: string;
};

export type ChunkSpecPlainTextResult = {
  chunks: SpecPlanChunk[];
  /** Documento maior que um único chunk (há mais de um trecho ou texto longo). */
  multiPart: boolean;
  /** Chunk count foi reduzido por teto (cobertura incompleta). */
  subsampled: boolean;
};

/**
 * Quebra texto normalizado em chunks com overlap; aplica teto com índices estratificados.
 */
export function chunkSpecPlainText(
  text: string,
  opts?: {
    targetChars?: number;
    overlap?: number;
    maxChunks?: number;
  }
): ChunkSpecPlainTextResult {
  const targetChars = opts?.targetChars ?? SPEC_PLAN_CHUNK_TARGET_CHARS;
  const overlap = Math.min(opts?.overlap ?? SPEC_PLAN_CHUNK_OVERLAP, Math.max(0, targetChars - 1));
  const maxChunks = opts?.maxChunks ?? SPEC_PLAN_MAX_CHUNKS;

  const normalized = String(text || "").replace(/\r\n/g, "\n");
  if (!normalized.trim()) {
    return { chunks: [], multiPart: false, subsampled: false };
  }

  const raw: Omit<SpecPlanChunk, "chunkId">[] = [];
  let start = 0;
  let idx = 0;

  while (start < normalized.length) {
    const end = Math.min(normalized.length, start + targetChars);
    raw.push({
      chunkIndex: idx,
      charStart: start,
      charEnd: end,
      text: normalized.slice(start, end),
    });
    idx++;
    if (end >= normalized.length) break;
    start = end - overlap;
  }

  let chunks: SpecPlanChunk[] = raw.map((c) => ({
    ...c,
    chunkId: `sp-${c.chunkIndex}`,
  }));

  let subsampled = false;
  if (chunks.length > maxChunks) {
    subsampled = true;
    const n = chunks.length;
    const indices = new Set<number>();
    for (let i = 0; i < maxChunks; i++) {
      const pos = maxChunks === 1 ? 0 : Math.floor((i * (n - 1)) / (maxChunks - 1));
      indices.add(Math.min(pos, n - 1));
    }
    const sorted = Array.from(indices).sort((a, b) => a - b);
    chunks = sorted.map((i) => chunks[i]);
  }

  const multiPart = normalized.length > targetChars || chunks.length > 1;

  return { chunks, multiPart, subsampled };
}
