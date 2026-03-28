import type {
  SpecPlanDocReadMeta,
  SpecPlanPhaseKey,
  SpecPlanPhaseState,
  SpecPlanPreviewRow,
  SpecPlanRunLogEntry,
  SpecPlanRunUiState,
} from "@/lib/spec-plan-run-types";

function newLogId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function safeStringify(obj: unknown, max = 4000): string {
  try {
    const s = JSON.stringify(obj, null, 2);
    return s.length > max ? `${s.slice(0, max)}\n…` : s;
  } catch {
    return String(obj);
  }
}

const PHASE_KEYS: SpecPlanPhaseKey[] = [
  "parse",
  "chunks",
  "embeddings",
  "retrieval",
  "outline",
  "work",
  "cards",
];

function initialPhases(remapOnly: boolean): Record<SpecPlanPhaseKey, SpecPlanPhaseState> {
  const base = PHASE_KEYS.reduce(
    (acc, k) => {
      acc[k] = "pending" as SpecPlanPhaseState;
      return acc;
    },
    {} as Record<SpecPlanPhaseKey, SpecPlanPhaseState>
  );
  if (remapOnly) {
    base.parse = "done";
    base.chunks = "done";
    base.embeddings = "done";
    base.retrieval = "done";
    base.outline = "done";
    base.work = "done";
    base.cards = "running";
  } else {
    base.parse = "running";
  }
  return base;
}

export function createInitialSpecPlanRunState(remapOnly: boolean): SpecPlanRunUiState {
  return {
    phases: initialPhases(remapOnly),
    docReadMeta: null,
    outlineSummary: null,
    methodologySummary: null,
    workItemsPayload: "",
    preview: [],
    streamError: null,
    streamErrorDetail: null,
    logs: [],
  };
}

function pushLog(
  logs: SpecPlanRunLogEntry[],
  level: SpecPlanRunLogEntry["level"],
  message: string,
  detail?: string
): SpecPlanRunLogEntry[] {
  const maxLogs = 120;
  const maxDetail = 2500;
  const d = detail && detail.length > maxDetail ? `${detail.slice(0, maxDetail)}…` : detail;
  const entry: SpecPlanRunLogEntry = {
    id: newLogId(),
    timestamp: Date.now(),
    level,
    message,
    detail: d,
  };
  return [...logs, entry].slice(-maxLogs);
}

function parsePreviewRows(payload: Record<string, unknown>): SpecPlanPreviewRow[] {
  const rows = payload.cardRows as Record<string, unknown>[] | undefined;
  const list: SpecPlanPreviewRow[] = [];
  if (!Array.isArray(rows)) return list;
  for (const r of rows) {
    list.push({
      title: String(r.title || "").slice(0, 300),
      desc: String(r.desc || "").slice(0, 6000),
      bucketKey: String(r.bucketKey || ""),
      priority: String(r.priority || "Média"),
      progress: String(r.progress || "Não iniciado"),
      tags: Array.isArray(r.tags) ? r.tags.map((x) => String(x)).filter(Boolean).slice(0, 30) : [],
      rationale: String(r.rationale || ""),
      blockedByTitles: Array.isArray(r.blockedByTitles)
        ? r.blockedByTitles.map((x) => String(x)).filter(Boolean)
        : [],
      subtasks: Array.isArray(r.subtasks)
        ? r.subtasks
            .map((s) => ({ title: String((s as { title?: string }).title || "").slice(0, 300) }))
            .filter((s) => s.title)
            .slice(0, 12)
        : [],
      storyPoints: typeof r.storyPoints === "number" ? r.storyPoints : null,
      serviceClass: typeof r.serviceClass === "string" ? r.serviceClass : null,
    });
  }
  return list;
}

/**
 * Aplica um evento SSE do pipeline ao estado da UI (espelha spec-plan-page).
 */
export function applySpecPlanSseEvent(
  state: SpecPlanRunUiState,
  event: string,
  data: Record<string, unknown>,
  remapOnly: boolean
): SpecPlanRunUiState {
  const phases = { ...state.phases };
  let logs = state.logs;

  const append = (level: SpecPlanRunLogEntry["level"], message: string, detail?: string) => {
    logs = pushLog(logs, level, message, detail);
  };

  if (event === "status") {
    append("info", "Sessão de análise iniciada.", safeStringify({ remapOnly, ...data }));
    return { ...state, phases, logs };
  }

  if (event === "document_parsed") {
    const fn = String(data.fileName || "—");
    const chars =
      typeof data.charCount === "number" && Number.isFinite(data.charCount) ? data.charCount : 0;
    const warns = Array.isArray(data.warnings) ? data.warnings.map((w) => String(w)).filter(Boolean) : [];
    const docReadMeta: SpecPlanDocReadMeta = {
      fileName: fn,
      kind: String(data.kind || "—"),
      charCount: typeof data.charCount === "number" ? data.charCount : undefined,
      pageCount: typeof data.pageCount === "number" ? data.pageCount : undefined,
      warnings: warns,
    };
    phases.parse = "done";
    phases.chunks = "running";
    append("success", `Documento lido: ${fn} (${chars} caracteres).`, safeStringify(data));
    return { ...state, phases, docReadMeta, logs };
  }

  if (event === "chunks_ready") {
    phases.chunks = "done";
    phases.embeddings = "running";
    append(
      "info",
      `Texto dividido em ${Number(data.chunkCount) || 0} trechos (média ${Number(data.avgSize) || 0} caracteres).`,
      safeStringify(data)
    );
    return { ...state, phases, logs };
  }

  if (event === "embeddings_ready") {
    const failed = Boolean(data.failed);
    append(
      failed ? "error" : "success",
      `Embeddings: ${Number(data.embeddedCount) || 0} vetores (${String(data.modelHint || "—")}).`,
      safeStringify(data)
    );
    if (failed) append("error", "Falha ao gerar embeddings — usando trecho truncado no outline.", undefined);
    phases.embeddings = "done";
    phases.retrieval = "running";
    return { ...state, phases, logs };
  }

  if (event === "retrieval_ready") {
    phases.retrieval = "done";
    phases.outline = "running";
    append(
      "info",
      `Recuperação semântica: ${Number(data.chunksUsed) || 0} trecho(s) no contexto.`,
      safeStringify(data)
    );
    return { ...state, phases, logs };
  }

  if (event === "outline_ready") {
    phases.outline = "done";
    phases.work = "running";
    const sections = data.sections as unknown[];
    const kr = data.keyRequirements as unknown[];
    const outlineSummary = `${Array.isArray(sections) ? sections.length : 0} seções · ${Array.isArray(kr) ? kr.length : 0} requisitos`;
    append("success", "Estrutura e requisitos-chave gerados.", safeStringify(data));
    return { ...state, phases, outlineSummary, logs };
  }

  if (event === "work_items_llm_started") {
    const n = typeof data.outlineJsonChars === "number" && Number.isFinite(data.outlineJsonChars) ? data.outlineJsonChars : 0;
    append(
      "info",
      `Itens de trabalho: chamada à IA em curso (outline no prompt ~${n} caracteres). PDFs longos podem demorar vários minutos nesta etapa.`,
      safeStringify(data)
    );
    return { ...state, phases, logs };
  }

  if (event === "work_items_draft") {
    phases.work = "done";
    const payload = JSON.stringify(data);
    append("success", "Rascunho de itens de trabalho recebido.", safeStringify({ keys: Object.keys(data) }));
    return { ...state, phases, workItemsPayload: payload, logs };
  }

  if (event === "methodology_applied") {
    const s = data.summary;
    const methodologySummary = typeof s === "string" ? s.slice(0, 800) : null;
    append("info", "Metodologia aplicada ao rascunho.", safeStringify(data));
    return { ...state, methodologySummary, logs };
  }

  if (event === "bucket_mapping") {
    phases.cards = "running";
    append("info", "Mapeamento sugerido para colunas do board.", safeStringify(data));
    return { ...state, phases, logs };
  }

  if (event === "cards_preview") {
    phases.cards = "done";
    const preview = parsePreviewRows(data);
    append("success", `Preview de ${preview.length} card(s) recebido.`, safeStringify({ cardCount: preview.length }));
    return { ...state, phases, preview, logs };
  }

  if (event === "error") {
    const msg = typeof data.message === "string" ? data.message : "Erro no fluxo";
    phases.parse = phases.parse === "running" ? "error" : phases.parse;
    phases.cards = "error";
    phases.chunks = phases.chunks === "running" ? "error" : phases.chunks;
    phases.embeddings = phases.embeddings === "running" ? "error" : phases.embeddings;
    phases.retrieval = phases.retrieval === "running" ? "error" : phases.retrieval;
    phases.outline = phases.outline === "running" ? "error" : phases.outline;
    phases.work = phases.work === "running" ? "error" : phases.work;
    append("error", msg, safeStringify(data));
    return {
      ...state,
      phases,
      streamError: msg,
      streamErrorDetail: safeStringify(data),
      logs,
    };
  }

  if (event === "done") {
    return { ...state, logs };
  }

  return state;
}

export function foldSpecPlanSseEvents(
  remapOnly: boolean,
  events: { event: string; data: Record<string, unknown> }[]
): SpecPlanRunUiState {
  let s = createInitialSpecPlanRunState(remapOnly);
  for (const { event, data } of events) {
    s = applySpecPlanSseEvent(s, event, data, remapOnly);
  }
  return s;
}
