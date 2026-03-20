import { z } from "zod";

/**
 * Sanitiza texto removendo HTML potencialmente perigoso.
 * Observacao: como o front renderiza a maioria desses campos como texto (React),
 * a meta aqui e defesa em profundidade: remover tags/entidades para reduzir risco
 * de payloads XSS ao persistir dados vindos de usuarios.
 */
function decodeHtmlEntities(input: string): string {
  // Mapa de entidades comuns.
  const named: Record<string, string> = {
    lt: "<",
    gt: ">",
    amp: "&",
    quot: '"',
    apos: "'",
  };

  const numericHex = /&#x([0-9a-fA-F]+);/g;
  const numericDec = /&#([0-9]+);/g;
  const namedEntity = /&([a-zA-Z]+);/g;

  let out = String(input);

  out = out.replace(numericHex, (_, hex: string) => {
    try {
      return String.fromCharCode(parseInt(hex, 16));
    } catch {
      return "";
    }
  });
  out = out.replace(numericDec, (_, dec: string) => {
    try {
      return String.fromCharCode(parseInt(dec, 10));
    } catch {
      return "";
    }
  });
  out = out.replace(namedEntity, (_, key: string) => {
    const k = String(key || "").toLowerCase();
    return Object.prototype.hasOwnProperty.call(named, k) ? named[k] : "";
  });

  return out;
}

function stripHtmlTags(input: string): string {
  let out = String(input);

  // Remove blocos script/style inteiros (mesmo que cheguem via entidades).
  out = out.replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  // Remove tags HTML (deixando conteudo textual quando aplicavel).
  out = out.replace(/<\/?[^>]+>/g, "");
  // Remove tentativa comum de execucao via esquema javascript em strings.
  out = out.replace(/javascript\s*:/gi, "");

  return out;
}

export function sanitizeText(input: unknown): string {
  const raw = String(input ?? "");
  if (!/[<>&]/.test(raw)) return raw;

  const decoded = decodeHtmlEntities(raw);
  return stripHtmlTags(decoded);
}

export function sanitizeDeep<T>(value: T, opts?: { maxDepth?: number; maxNodes?: number }): T {
  const maxDepth = opts?.maxDepth ?? 8;
  const maxNodes = opts?.maxNodes ?? 5000;
  const state = { nodes: 0 };

  const rec = (v: unknown, depth: number): unknown => {
    if (state.nodes++ > maxNodes) return v;
    if (depth > maxDepth) return v;

    if (typeof v === "string") return sanitizeText(v);
    if (v === null || v === undefined) return v;

    if (Array.isArray(v)) {
      return v.map((item) => rec(item, depth + 1));
    }

    if (typeof v === "object") {
      // Nao clona objetos especiais; lida apenas com literais/arrays vindos de JSON.
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null) return v;

      const out: Record<string, unknown> = {};
      for (const [k, vv] of Object.entries(v as Record<string, unknown>)) {
        out[k] = rec(vv, depth + 1);
      }
      return out;
    }

    return v;
  };

  return rec(value, 0) as T;
}

export function zodErrorToMessage(err: z.ZodError<unknown>): string {
  const issues = err.issues
    .slice(0, 6)
    .map((i) => {
      const path = i.path.length ? i.path.join(".") : "payload";
      const message = i.message === "Required" || i.message === "required" ? "Campo obrigatorio." : i.message;
      return `${path}: ${message}`;
    })
    .join("; ");
  return `Payload invalido. ${issues || "Verifique os campos enviados."}`;
}

function isSafeLinkUrl(url: string): boolean {
  const s = String(url || "").trim();
  if (!s) return false;

  // Bloqueia esquemas comuns de XSS.
  if (/^javascript\s*:/i.test(s)) return false;
  if (/^data\s*:/i.test(s)) return false;

  // Hash puro (ex.: #section) pode ser valido.
  if (s.startsWith("#")) return true;

  // Se houver esquema explícito (ex.: http:, mailto:, etc), valida allowlist.
  const schemeMatch = s.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (schemeMatch) {
    const scheme = `${schemeMatch[1].toLowerCase()}:`;
    return ["http:", "https:", "mailto:"].includes(scheme);
  }

  // Sem esquema => assume URL relativa/protocol-relative, que nao executa JavaScript como href.
  return true;
}

// -----------------------
// Request body schemas
// -----------------------

export const BoardCreateSchema = z
  .object({
    name: z.string().trim().min(1, "Nome do board e obrigatorio.").max(100).optional(),
  })
  .passthrough();

export const BucketConfigSchema = z
  .object({
    key: z.string().trim().min(1, "Chave do bucket e obrigatoria.").max(200),
    label: z.string().trim().min(1, "Label do bucket e obrigatoria.").max(200),
    color: z.string().trim().min(1).max(50),
  })
  .passthrough();

export const CardLinkSchema = z
  .object({
    url: z
      .string()
      .trim()
      .min(1, "URL do link e obrigatoria.")
      .max(2048)
      .refine((v) => isSafeLinkUrl(v), "URL invalida (somente http/https/mailto)."),
    label: z.string().trim().max(200).optional(),
  })
  .passthrough();

export const CardDataSchema = z
  .object({
    id: z.string().trim().min(1, "ID do card e obrigatorio.").max(200),
    bucket: z.string().trim().min(1).max(200),
    priority: z.string().trim().min(1).max(100),
    progress: z.string().trim().min(1).max(100),
    title: z.string().trim().min(1).max(300),
    desc: z.string().trim().max(6000),
    tags: z.array(z.string().trim().max(60)).max(30).optional().default([]),
    links: z.array(CardLinkSchema).optional(),
    direction: z.string().trim().nullable().optional(),
    dueDate: z.string().trim().nullable().optional(),
    order: z.number().int().nonnegative().max(1_000_000),
  })
  .passthrough();

const MapaProducaoItemSchema = z
  .object({
    papel: z.string().trim().max(200),
    equipe: z.string().trim().max(200),
    linha: z.string().trim().max(200),
    operacoes: z.string().trim().max(4000),
  })
  .passthrough();

export const DailyInsightActionPayloadSchema = z
  .object({
    titulo: z.string().trim().max(200).optional(),
    descricao: z.string().trim().max(4000).optional(),
    prioridade: z.string().trim().max(100).optional(),
    progresso: z.string().trim().max(100).optional(),
    coluna: z.string().trim().max(200).optional(),
    tags: z.array(z.string().trim().max(60)).optional(),
    dataConclusao: z.string().trim().max(50).optional(),
    direcionamento: z.string().trim().max(100).optional(),
  })
  .passthrough();

export const DailyCreatedCardSchema = z
  .object({
    cardId: z.string().trim().min(1).max(200),
    title: z.string().trim().max(300),
    bucket: z.string().trim().max(200),
    priority: z.string().trim().max(100),
    progress: z.string().trim().max(100),
    desc: z.string().trim().max(6000).optional(),
    tags: z.array(z.string().trim().max(60)).optional(),
    direction: z.string().trim().nullable().optional(),
    dueDate: z.string().trim().nullable().optional(),
    createdAt: z.string().trim().optional(),
    status: z.enum(["created", "existing"]).optional(),
  })
  .passthrough();

export const DailyInsightPayloadSchema = z
  .object({
    resumo: z.string().trim().optional(),
    contextoOrganizado: z.string().trim().optional(),
    criar: z.array(z.string().trim().max(200)).optional(),
    criarDetalhes: z.array(DailyInsightActionPayloadSchema).optional(),
    ajustar: z.array(z.union([z.string().trim().max(300), DailyInsightActionPayloadSchema])).optional(),
    corrigir: z.array(z.union([z.string().trim().max(300), DailyInsightActionPayloadSchema])).optional(),
    pendencias: z.array(z.union([z.string().trim().max(300), DailyInsightActionPayloadSchema])).optional(),
  })
  .passthrough();

export const DailyInsightEntrySchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    createdAt: z.string().trim().optional(),
    transcript: z.string().trim().max(20000).optional(),
    sourceFileName: z.string().trim().max(200).optional(),
    insight: DailyInsightPayloadSchema.optional(),
    createdCards: z.array(DailyCreatedCardSchema).optional(),
    generationMeta: z
      .object({
        usedLlm: z.boolean().optional(),
        model: z.string().trim().max(200).optional(),
      })
      .optional(),
  })
  .passthrough();

export const BoardUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    clientLabel: z.string().trim().max(120).optional().nullable(),
    cards: z.array(CardDataSchema).optional(),
    config: z
      .object({
        bucketOrder: z.array(BucketConfigSchema).min(1),
        collapsedColumns: z.array(z.string().trim().max(200)).optional(),
        labels: z.array(z.string().trim().max(200)).optional(),
      })
      .optional(),
    mapaProducao: z.array(MapaProducaoItemSchema).optional(),
    dailyInsights: z.array(DailyInsightEntrySchema).optional(),
    version: z.string().trim().max(50).optional(),
    lastUpdated: z.string().trim().max(200).optional(),
  })
  .passthrough();

// -----------------------
// OKRs (Objectives / Key Results)
// -----------------------

export const OkrsObjectiveCreateSchema = z
  .object({
    title: z.string().trim().min(1, "Título é obrigatório.").max(200, "Título excede o limite."),
    owner: z.string().trim().max(200).optional().nullable(),
    quarter: z.string().trim().min(1, "Quarter é obrigatório.").max(50, "Quarter excede o limite."),
  })
  .passthrough();

export const OkrsObjectiveUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    owner: z.string().trim().max(200).optional().nullable(),
    quarter: z.string().trim().min(1).max(50).optional(),
  })
  .refine((data) => data.title !== undefined || data.owner !== undefined || data.quarter !== undefined, {
    message: "Informe ao menos um campo para atualização.",
  })
  .passthrough();

export const OkrsKeyResultMetricTypeSchema = z.enum(["card_count", "card_in_column", "Manual"]);

export const OkrsKeyResultCreateSchema = z
  .object({
    objectiveId: z.string().trim().min(1, "objectiveId é obrigatório.").max(200),
    title: z.string().trim().min(1, "Título é obrigatório.").max(200),
    metric_type: OkrsKeyResultMetricTypeSchema,
    target: z.preprocess(
      (v) => {
        if (typeof v === "string") {
          const s = v.trim();
          if (!s) return 0;
          const n = Number(s);
          return Number.isFinite(n) ? n : v;
        }
        return v;
      },
      z.number().finite().nonnegative().max(1_000_000_000)
    ),
    linkedBoardId: z.string().trim().min(1, "linkedBoardId é obrigatório.").max(200),
    linkedColumnKey: z.string().trim().max(200).optional().nullable(),
    manualCurrent: z.preprocess(
      (v) => {
        if (v === null || v === undefined) return v;
        if (typeof v === "string") {
          const s = v.trim();
          if (!s) return 0;
          const n = Number(s);
          return Number.isFinite(n) ? n : v;
        }
        return v;
      },
      z.number().finite().nonnegative().max(1_000_000_000)
    ).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.metric_type === "card_in_column") {
      const col = data.linkedColumnKey;
      if (!col || !String(col).trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "linkedColumnKey é obrigatório para card_in_column.", path: ["linkedColumnKey"] });
      }
    }
  })
  .passthrough();

export const OkrsKeyResultUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    metric_type: OkrsKeyResultMetricTypeSchema.optional(),
    target: z
      .preprocess(
        (v) => {
          if (typeof v === "string") {
            const s = v.trim();
            if (!s) return 0;
            const n = Number(s);
            return Number.isFinite(n) ? n : v;
          }
          return v;
        },
        z.number().finite().nonnegative().max(1_000_000_000)
      )
      .optional(),
    linkedBoardId: z.string().trim().min(1).max(200).optional(),
    linkedColumnKey: z.string().trim().max(200).optional().nullable(),
    manualCurrent: z
      .preprocess(
        (v) => {
          if (v === null || v === undefined) return v;
          if (typeof v === "string") {
            const s = v.trim();
            if (!s) return 0;
            const n = Number(s);
            return Number.isFinite(n) ? n : v;
          }
          return v;
        },
        z.number().finite().nonnegative().max(1_000_000_000)
      )
      .optional()
      .nullable(),
  })
  .refine(
    (data) =>
      data.title !== undefined ||
      data.metric_type !== undefined ||
      data.target !== undefined ||
      data.linkedBoardId !== undefined ||
      data.linkedColumnKey !== undefined ||
      data.manualCurrent !== undefined,
    { message: "Informe ao menos um campo para atualização." }
  )
  .passthrough();

export const DailyInsightInputSchema = z
  .object({
    transcript: z
      .string()
      .trim()
      .min(1, "Transcricao e obrigatoria.")
      .max(40000, "Transcricao excede o limite."),
    fileName: z.string().trim().max(200).optional(),
  })
  .passthrough();

export const CardContextInputSchema = z
  .object({
    title: z.string().trim().min(1, "Titulo e obrigatorio.").max(180),
    description: z
      .string()
      .trim()
      .min(1, "Descricao e obrigatoria.")
      .max(6000, "Descricao excede o limite."),
    forceRefresh: z.boolean().optional(),
  })
  .passthrough();

export const UserCreateSchema = z
  .object({
    name: z.string().trim().min(1, "Nome e obrigatorio.").max(200),
    email: z.string().trim().email("E-mail invalido.").max(320),
    password: z.string().min(4, "Senha e obrigatoria.").max(200),
  })
  .passthrough();

export const UserUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    email: z.string().trim().email("E-mail invalido.").max(320).optional(),
    password: z.string().min(4).max(200).optional(),
  })
  .passthrough();

