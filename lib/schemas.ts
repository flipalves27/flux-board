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

export const BoardTemplateSnapshotSchema = z.object({
  config: z.object({
    bucketOrder: z.array(z.unknown()),
    collapsedColumns: z.array(z.string()).optional(),
    labels: z.array(z.string()).optional(),
  }),
  mapaProducao: z.array(z.unknown()),
  labelPalette: z.array(z.string()),
  automations: z.array(z.unknown()),
});

export const BoardCreateSchema = z
  .object({
    name: z.string().trim().min(1, "Nome do board e obrigatorio.").max(100).optional(),
    /** Importa de template publicado no showcase. */
    templateId: z.string().trim().min(1).max(120).optional(),
    /** Instanciação direta (ex.: fluxo de IA) — não persistido no servidor. */
    templateSnapshot: BoardTemplateSnapshotSchema.optional(),
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

export const CardDocRefSchema = z
  .object({
    docId: z.string().trim().min(1).max(200),
    title: z.string().trim().max(200).optional(),
    excerpt: z.string().trim().max(500).optional(),
  })
  .passthrough();

export const CardAutomationStateSchema = z
  .object({
    lastFired: z.record(z.string(), z.string()).optional(),
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
    docRefs: z.array(CardDocRefSchema).optional(),
    direction: z.string().trim().nullable().optional(),
    dueDate: z.string().trim().nullable().optional(),
    blockedBy: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
    order: z.number().int().nonnegative().max(1_000_000),
    columnEnteredAt: z.string().trim().max(80).optional(),
    /** ISO quando progress virou Concluída (enriquecido no servidor). */
    completedAt: z.string().trim().max(80).optional(),
    /** Dias da coluna atual (antes de concluir) até completedAt. */
    completedCycleDays: z.number().int().min(0).max(3650).optional(),
    automationState: CardAutomationStateSchema.optional(),
  })
  .passthrough();

// -----------------------
// Flux Automations (regras internas)
// -----------------------

export const AutomationTriggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("card_moved_to_column"), columnKey: z.string().trim().min(1).max(200) }),
  z.object({ type: z.literal("card_created_with_tag"), tag: z.string().trim().min(1).max(80) }),
  z.object({
    type: z.literal("card_stuck_in_column"),
    columnKey: z.string().trim().min(1).max(200),
    days: z.number().int().min(1).max(365),
  }),
  z.object({ type: z.literal("due_date_within_days"), days: z.number().int().min(0).max(90) }),
  z.object({ type: z.literal("form_submission") }),
  z.object({ type: z.literal("board_completion_percent"), percent: z.number().min(1).max(100) }),
]);

export const AutomationActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("set_priority"), priority: z.string().trim().min(1).max(100) }),
  z.object({ type: z.literal("set_progress"), progress: z.string().trim().min(1).max(100) }),
  z.object({ type: z.literal("set_priority_and_notify_owner"), priority: z.string().trim().min(1).max(100) }),
  z.object({ type: z.literal("notify_owner_add_tag"), tag: z.string().trim().min(1).max(60) }),
  z.object({ type: z.literal("send_due_reminder_email") }),
  z.object({ type: z.literal("classify_card_with_ai") }),
  z.object({ type: z.literal("generate_executive_brief_email") }),
]);

export const AutomationRuleSchema = z.object({
  id: z.string().trim().min(1).max(200),
  enabled: z.boolean().optional().default(true),
  name: z.string().trim().max(120).optional(),
  trigger: AutomationTriggerSchema,
  action: AutomationActionSchema,
});

export const AutomationRulesUpsertSchema = z.object({
  rules: z.array(AutomationRuleSchema).max(40),
});

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

export const PortalBrandingSchema = z
  .object({
    logoUrl: z.union([z.string().trim().url().max(2048), z.literal("")]).optional().nullable(),
    primaryColor: z.string().trim().max(32).optional().nullable(),
    secondaryColor: z.string().trim().max(32).optional().nullable(),
    title: z.string().trim().max(120).optional().nullable(),
  })
  .passthrough();

/** Atualização parcial de branding da organização (Enterprise). */
export const TemplateExportBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().default(""),
  category: z.enum([
    "sales",
    "operations",
    "projects",
    "hr",
    "marketing",
    "customer_success",
    "support",
    "insurance_warranty",
  ]),
  pricingTier: z.enum(["free", "premium"]),
});

export const OrgBrandingUpdateSchema = z
  .object({
    logoUrl: z.union([z.string().trim().url().max(2048), z.literal("")]).optional().nullable(),
    primaryColor: z.string().trim().max(32).optional().nullable(),
    secondaryColor: z.string().trim().max(32).optional().nullable(),
    faviconUrl: z.union([z.string().trim().url().max(2048), z.literal("")]).optional().nullable(),
    customDomain: z
      .string()
      .trim()
      .max(200)
      .regex(/^[a-z0-9.-]*$/i, "Domínio inválido.")
      .optional()
      .nullable(),
  })
  .passthrough();

export const PortalBoardUpdateSchema = z
  .object({
    enabled: z.boolean().optional(),
    regenerateToken: z.boolean().optional(),
    visibleBucketKeys: z.array(z.string().trim().max(200)).max(50).optional(),
    cardIdsAllowlist: z.array(z.string().trim().max(200)).max(50).optional(),
    branding: PortalBrandingSchema.optional(),
    portalPassword: z.union([z.string().min(4).max(200), z.literal(""), z.null()]).optional(),
  })
  .passthrough();

const AnomalyNotifyKindZ = z.enum([
  "throughput_drop",
  "wip_explosion",
  "lead_time_spike",
  "stagnation_cluster",
  "okr_drift",
  "overdue_cascade",
  "cross_board_blocker_overdue",
]);

export const BoardAnomalyNotificationsSchema = z.object({
  emailEnabled: z.boolean().optional(),
  notifyKinds: z.array(AnomalyNotifyKindZ).max(7).optional(),
  minSeverity: z.enum(["warning", "critical"]).optional(),
  recipientEmails: z.array(z.string().trim().email("Email inválido.").max(320)).max(15).optional(),
});

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
    intakeForm: z
      .object({
        enabled: z.boolean().optional(),
        slug: z.string().trim().min(3).max(80).optional(),
        title: z.string().trim().min(1).max(120).optional(),
        description: z.string().trim().max(400).optional().nullable(),
        targetBucketKey: z.string().trim().min(1).max(200).optional(),
        defaultPriority: z.string().trim().min(1).max(100).optional(),
        defaultProgress: z.string().trim().min(1).max(100).optional(),
        defaultTags: z.array(z.string().trim().max(60)).max(20).optional(),
      })
      .optional(),
    portal: PortalBoardUpdateSchema.optional(),
    anomalyNotifications: z.union([BoardAnomalyNotificationsSchema, z.null()]).optional(),
  })
  .passthrough();

export const IntakeFormUpsertSchema = z
  .object({
    enabled: z.boolean().optional().default(true),
    slug: z.string().trim().min(3, "Slug obrigatório.").max(80),
    title: z.string().trim().min(1, "Título obrigatório.").max(120),
    description: z.string().trim().max(400).optional().nullable(),
    targetBucketKey: z.string().trim().min(1, "Coluna de destino obrigatória.").max(200),
    defaultPriority: z.string().trim().min(1).max(100).optional().default("Média"),
    defaultProgress: z.string().trim().min(1).max(100).optional().default("Não iniciado"),
    defaultTags: z.array(z.string().trim().max(60)).max(20).optional().default([]),
  })
  .passthrough();

export const IntakeSubmissionSchema = z
  .object({
    requesterName: z.string().trim().min(1, "Nome é obrigatório.").max(120),
    requesterEmail: z.string().trim().email("Email inválido.").max(320).optional().or(z.literal("")),
    title: z.string().trim().min(3, "Título muito curto.").max(180),
    description: z.string().trim().min(5, "Descreva melhor a demanda.").max(5000),
    tags: z.array(z.string().trim().max(60)).max(10).optional(),
  })
  .passthrough();

export const DocCreateSchema = z
  .object({
    title: z.string().trim().min(1, "Título é obrigatório.").max(200),
    parentId: z.string().trim().max(200).nullable().optional(),
    contentMd: z.string().max(300_000).optional(),
    tags: z.array(z.string().trim().max(60)).max(50).optional(),
  })
  .passthrough();

export const DocUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    parentId: z.string().trim().max(200).nullable().optional(),
    contentMd: z.string().max(300_000).optional(),
    tags: z.array(z.string().trim().max(60)).max(50).optional(),
  })
  .refine((data) => data.title !== undefined || data.parentId !== undefined || data.contentMd !== undefined || data.tags !== undefined, {
    message: "Informe ao menos um campo para atualização.",
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

export const SmartCardEnrichInputSchema = z
  .object({
    title: z.string().trim().min(1, "Titulo e obrigatorio.").max(180),
    knownTags: z.array(z.string().trim().max(80)).max(120).optional(),
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

export const UserThemePreferenceSchema = z.object({
  themePreference: z.enum(["light", "dark", "system"]),
});

