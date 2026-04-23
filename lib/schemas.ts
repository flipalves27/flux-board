import { z } from "zod";
import { LSS_ASSIST_MODES } from "./lss-assist-prompt";
import { LSS_PREMIUM_ASSIST_MODES } from "./lss-premium-assist-prompt";
import { SAFE_ASSIST_MODES } from "./safe-assist-prompt";
import { BPMN_NODE_TYPES } from "./bpmn-types";
import { WEBHOOK_EVENT_TYPES } from "./webhook-types";

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

export function isSafeLinkUrl(url: string): boolean {
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

export const BoardMethodologySchema = z.enum(["scrum", "kanban", "lean_six_sigma", "discovery", "safe"]);

export const LssAssistBodySchema = z.object({
  mode: z.enum(LSS_ASSIST_MODES as unknown as [string, ...string[]]),
  context: z.string().max(12_000).optional().default(""),
  cardId: z.string().trim().max(200).optional(),
});

export const LssPremiumAssistBodySchema = z.object({
  mode: z.enum(LSS_PREMIUM_ASSIST_MODES as unknown as [string, ...string[]]),
  context: z.string().max(12_000).optional().default(""),
  cardId: z.string().trim().max(200).optional(),
});

export const SafeAssistBodySchema = z.object({
  mode: z.enum(SAFE_ASSIST_MODES as unknown as [string, ...string[]]),
  context: z.string().max(12_000).optional().default(""),
  cardId: z.string().trim().max(200).optional(),
});

export const PriorityMatrixQuadrantKeySchema = z.enum(["do_first", "schedule", "delegate", "eliminate"]);

const BpmnNodeTypeSchema = z.enum(BPMN_NODE_TYPES as unknown as [string, ...string[]]);
const BpmnSemanticVariantSchema = z.preprocess(
  (v) => (v === "reborn" ? "delivered" : v),
  z.enum(["default", "delivered", "automation", "pain", "system"])
);
const BpmnEdgeKindSchema = z.enum(["default", "primary", "rework", "cross_lane"]);
const BpmnPortSchema = z.enum(["north", "east", "south", "west"]);

const BpmnWaypointSchema = z.object({ x: z.number().finite(), y: z.number().finite() });

const BpmnModelSchema = z.object({
  version: z.literal("bpmn-2.0-lite"),
  name: z.string().trim().min(1).max(200),
  lanes: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(80),
        label: z.string().trim().min(1).max(200),
        y: z.number().finite().optional(),
        height: z.number().finite().optional(),
        tag: z.string().trim().max(200).optional(),
      })
    )
    .max(30),
  nodes: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(80),
        type: BpmnNodeTypeSchema,
        label: z.string().trim().min(1).max(200),
        x: z.number().finite(),
        y: z.number().finite(),
        laneId: z.string().trim().max(80).optional(),
        width: z.number().finite().optional(),
        height: z.number().finite().optional(),
        subtitle: z.string().trim().max(500).optional(),
        stepNumber: z.string().trim().max(40).optional(),
        semanticVariant: BpmnSemanticVariantSchema.optional(),
        tooltip: z.string().trim().max(2000).optional(),
        painBadge: z.string().trim().max(40).optional(),
      })
    )
    .max(500),
  edges: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(80),
        sourceId: z.string().trim().min(1).max(80),
        targetId: z.string().trim().min(1).max(80),
        label: z.string().trim().max(200).optional(),
        kind: BpmnEdgeKindSchema.optional(),
        sourcePort: BpmnPortSchema.optional(),
        targetPort: BpmnPortSchema.optional(),
        waypoints: z.array(BpmnWaypointSchema).max(200).optional(),
      })
    )
    .max(800),
});

export const BoardTemplateSnapshotSchema = z.object({
  config: z.object({
    bucketOrder: z.array(z.unknown()),
    collapsedColumns: z.array(z.string()).optional(),
    labels: z.array(z.string()).optional(),
  }),
  mapaProducao: z.array(z.unknown()),
  labelPalette: z.array(z.string()),
  automations: z.array(z.unknown()),
  boardMethodology: BoardMethodologySchema.optional(),
  templateKind: z.enum(["kanban", "priority_matrix", "bpmn"]).optional(),
  priorityMatrixModel: z.enum(["eisenhower", "grid4"]).optional(),
  templateCards: z.array(z.unknown()).optional(),
  priorityMatrixMeta: z.unknown().optional(),
  bpmnModel: BpmnModelSchema.optional(),
});

export const BoardCreateSchema = z
  .object({
    name: z.string().trim().min(1, "Nome do board e obrigatorio.").max(100).optional(),
    /** Scrum (sprints) ou Kanban (fluxo e cadências). Padrão scrum se omitido (API legada). */
    boardMethodology: BoardMethodologySchema.optional().default("scrum"),
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
    /** Limite WIP (work in progress) — máximo de cards na coluna. */
    wipLimit: z.number().int().min(1).max(999).optional().nullable(),
    /** Política explícita de uso da coluna. */
    policy: z.string().trim().max(500).optional().nullable(),
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

export const BoardDefinitionOfDoneItemSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(300),
});

export const BoardDefinitionOfDoneSchema = z.object({
  enabled: z.boolean(),
  enforce: z.boolean(),
  doneBucketKeys: z.array(z.string().trim().max(200)).max(20).optional(),
  items: z.array(BoardDefinitionOfDoneItemSchema).max(20),
});

export const CardAutomationStateSchema = z
  .object({
    lastFired: z.record(z.string(), z.string()).optional(),
  })
  .passthrough();

// -----------------------
// Subtasks (v5 roadmap)
// -----------------------

export const SubtaskSchema = z.object({
  id: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(300),
  status: z.enum(["pending", "in_progress", "done", "blocked"]),
  assigneeId: z.string().trim().max(200).nullable().default(null),
  dueDate: z.string().trim().max(30).nullable().default(null),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  order: z.coerce.number().int().nonnegative().max(1000),
  estimateHours: z.number().min(0).max(9999).nullable().default(null),
  completedAt: z.string().trim().max(80).nullable().default(null),
  createdAt: z.string().trim().max(80),
  parentSubtaskId: z.string().trim().max(100).nullable().default(null),
});

export type SubtaskData = z.infer<typeof SubtaskSchema>;

export const SubtaskProgressSchema = z.object({
  total: z.number().int().min(0),
  done: z.number().int().min(0),
  blocked: z.number().int().min(0),
  pct: z.number().min(0).max(100),
});

export type SubtaskProgress = z.infer<typeof SubtaskProgressSchema>;

export function computeSubtaskProgress(subtasks: SubtaskData[]): SubtaskProgress {
  const total = subtasks.length;
  const done = subtasks.filter((s) => s.status === "done").length;
  const blocked = subtasks.filter((s) => s.status === "blocked").length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return { total, done, blocked, pct };
}

/** Story points (Fibonacci) — Scrum / estimativa de PBI. */
export const STORY_POINTS_FIBONACCI = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89] as const;
export type StoryPointsFibonacci = (typeof STORY_POINTS_FIBONACCI)[number];

export const CardStoryPointsSchema = z
  .number()
  .int()
  .refine((n) => (STORY_POINTS_FIBONACCI as readonly number[]).includes(n), { message: "Story points inválidos" });

/** Classes de serviço Kanban (visibilidade explícita no card). */
export const CARD_SERVICE_CLASS_VALUES = ["expedite", "fixed_date", "standard", "intangible"] as const;
export type CardServiceClass = (typeof CARD_SERVICE_CLASS_VALUES)[number];
export const CardServiceClassSchema = z.enum(CARD_SERVICE_CLASS_VALUES);

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
    assigneeId: z.string().trim().max(200).nullable().optional(),
    blockedBy: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
    order: z.number().int().nonnegative().max(1_000_000),
    columnEnteredAt: z.string().trim().max(80).optional(),
    /** ISO quando progress virou Concluída (enriquecido no servidor). */
    completedAt: z.string().trim().max(80).optional(),
    /** Dias da coluna atual (antes de concluir) até completedAt. */
    completedCycleDays: z.number().int().min(0).max(3650).optional(),
    automationState: CardAutomationStateSchema.optional(),
    subtasks: z.array(SubtaskSchema).max(50).optional().default([]),
    subtaskProgress: SubtaskProgressSchema.optional(),
    dorReady: z
      .object({
        titleOk: z.boolean().optional(),
        acceptanceOk: z.boolean().optional(),
        depsOk: z.boolean().optional(),
        sizedOk: z.boolean().optional(),
      })
      .optional(),
    dodChecks: z.record(z.string().trim().max(80), z.boolean()).optional(),
    storyPoints: CardStoryPointsSchema.nullable().optional(),
    serviceClass: CardServiceClassSchema.nullable().optional(),
    matrixWeight: z.number().min(0).max(100).optional(),
    matrixWeightBand: z.enum(["low", "medium", "high", "critical"]).optional(),
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

export const MapaProducaoItemSchema = z
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
    accentColor: z.string().trim().max(32).optional().nullable(),
    title: z.string().trim().max(120).optional().nullable(),
  })
  .passthrough();

/** Atualização parcial de branding da organização (planos pagos). */
export const PriorityMatrixGridSelectionSchema = z.object({
  cardId: z.string().trim().min(1).max(200),
  row: z.number().int().min(0).max(3),
  col: z.number().int().min(0).max(3),
});

export const TemplateExportBodySchema = z
  .object({
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
    templateKind: z.enum(["kanban", "priority_matrix", "bpmn"]).optional().default("kanban"),
    /** Eisenhower: quadrantes. Ignorado quando priorityMatrixModel é grid4. */
    priorityMatrixSelections: z
      .array(
        z.object({
          cardId: z.string().trim().min(1).max(200),
          quadrantKey: PriorityMatrixQuadrantKeySchema,
        })
      )
      .max(100)
      .optional(),
    /** Padrão eisenhower para matriz clássica; grid4 para grade 4×4. */
    priorityMatrixModel: z.enum(["eisenhower", "grid4"]).optional().default("eisenhower"),
    priorityMatrixGridSelections: z.array(PriorityMatrixGridSelectionSchema).max(100).optional(),
    bpmnModel: BpmnModelSchema.optional(),
    bpmnMarkdown: z.string().max(300_000).optional(),
    bpmnXml: z.string().max(300_000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.templateKind === "kanban" && data.priorityMatrixSelections && data.priorityMatrixSelections.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "priorityMatrixSelections só é permitido com templateKind priority_matrix.",
        path: ["priorityMatrixSelections"],
      });
    }
    if (data.templateKind === "kanban" && data.priorityMatrixGridSelections && data.priorityMatrixGridSelections.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "priorityMatrixGridSelections só é permitido com templateKind priority_matrix.",
        path: ["priorityMatrixGridSelections"],
      });
    }
    if (data.templateKind === "priority_matrix" && data.priorityMatrixModel === "grid4" && data.priorityMatrixSelections && data.priorityMatrixSelections.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Com matriz 4×4 use priorityMatrixGridSelections, não priorityMatrixSelections.",
        path: ["priorityMatrixSelections"],
      });
    }
    if (data.templateKind === "priority_matrix" && data.priorityMatrixModel === "eisenhower" && data.priorityMatrixGridSelections && data.priorityMatrixGridSelections.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Com Eisenhower use priorityMatrixSelections, não priorityMatrixGridSelections.",
        path: ["priorityMatrixGridSelections"],
      });
    }
    if (data.templateKind === "bpmn") {
      const supplied = [data.bpmnModel ? 1 : 0, data.bpmnMarkdown ? 1 : 0, data.bpmnXml ? 1 : 0].reduce((a, b) => a + b, 0);
      if (supplied === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Para template BPMN, informe bpmnModel, bpmnMarkdown ou bpmnXml.",
          path: ["bpmnModel"],
        });
      }
      if (data.priorityMatrixSelections?.length || data.priorityMatrixGridSelections?.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Seleções de matriz não se aplicam ao template BPMN.",
          path: ["templateKind"],
        });
      }
    }
  });

const brandingImageUrl = z.union([
  z.string().trim().url().max(4096),
  z
    .string()
    .trim()
    .max(3_000_000)
    .refine((s) => s.startsWith("data:image/"), "Logo/favicon: use https URL ou data:image/… base64."),
  z.literal(""),
  z.null(),
]);

export const OrgBrandingUpdateSchema = z
  .object({
    logoUrl: brandingImageUrl.optional().nullable(),
    primaryColor: z.string().trim().max(32).optional().nullable(),
    secondaryColor: z.string().trim().max(32).optional().nullable(),
    accentColor: z.string().trim().max(32).optional().nullable(),
    faviconUrl: brandingImageUrl.optional().nullable(),
    platformName: z.string().trim().max(80).optional().nullable(),
    emailFrom: z.string().trim().max(255).optional().nullable(),
    customDomain: z
      .string()
      .trim()
      .max(200)
      .regex(/^[a-z0-9.-]*$/i, "Domínio inválido.")
      .optional()
      .nullable(),
    /** Gera novo token TXT sem alterar o hostname. Plano Business. */
    regenerateDomainToken: z.boolean().optional(),
  })
  .passthrough();

export const OrgAiSettingsUpdateSchema = z
  .object({
    anthropicModel: z.string().trim().max(120).optional().nullable(),
    batchLlmProvider: z.enum(["anthropic", "together"]).optional().nullable(),
    claudeUserIds: z.array(z.string().trim().max(120)).max(200).optional().nullable(),
  })
  .strict();

export const OrgOnda4UiPatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    omnibar: z.boolean().optional(),
    dailyBriefing: z.boolean().optional(),
    anomalyToasts: z.boolean().optional(),
  })
  .strict();

export const OrgUiSettingsUpdateSchema = z
  .object({
    onda4: OrgOnda4UiPatchSchema.optional(),
  })
  .strict();

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
  "scope_creep",
]);

export const BoardAnomalyNotificationsSchema = z.object({
  emailEnabled: z.boolean().optional(),
  notifyKinds: z.array(AnomalyNotifyKindZ).max(8).optional(),
  minSeverity: z.enum(["warning", "critical"]).optional(),
  recipientEmails: z.array(z.string().trim().email("Email inválido.").max(320)).max(15).optional(),
});

export const SipocDraftSchema = z.object({
  suppliers: z.string().trim().max(2000).optional(),
  inputs: z.string().trim().max(2000).optional(),
  process: z.string().trim().max(2000).optional(),
  outputs: z.string().trim().max(2000).optional(),
  customers: z.string().trim().max(2000).optional(),
});

export const BoardUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    boardMethodology: BoardMethodologySchema.optional(),
    clientLabel: z.string().trim().max(120).optional().nullable(),
    /** Só para ultrapassar WIP com enforcement strict; não é persistido no documento do board. */
    wipOverrideReason: z.string().trim().min(8).max(500).optional(),
    cards: z.array(CardDataSchema).optional(),
    config: z
      .object({
        bucketOrder: z.array(BucketConfigSchema).min(1),
        collapsedColumns: z.array(z.string().trim().max(200)).optional(),
        labels: z.array(z.string().trim().max(200)).optional(),
        productGoal: z.string().trim().max(800).optional().nullable(),
        backlogBucketKey: z.string().trim().max(200).optional().nullable(),
        definitionOfDone: BoardDefinitionOfDoneSchema.optional().nullable(),
        /** strict = validar WIP no servidor (padrão); soft = permitir acima do limite. */
        wipEnforcement: z.enum(["strict", "soft"]).optional(),
        sipocDraft: SipocDraftSchema.optional().nullable(),
        cardRules: z
          .object({
            requireAssignee: z.boolean().optional(),
          })
          .optional(),
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

export const CardVoiceDraftInputSchema = z
  .object({
    transcript: z
      .string()
      .trim()
      .min(1, "Transcricao e obrigatoria.")
      .max(4000, "Transcricao excede o limite."),
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
    password: z.string().min(8, "Senha deve ter pelo menos 8 caracteres.").max(200),
    orgRole: z.enum(["gestor", "membro", "convidado"]).optional(),
    /** Novos usuários não podem ser criados como administrador da organização. */
    isAdmin: z.boolean().optional(),
  })
  .refine((d) => d.isAdmin !== true, {
    message: "Novos usuarios nao podem ser criados como administrador da organizacao.",
    path: ["isAdmin"],
  })
  .passthrough();

export const UserUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    email: z.string().trim().email("E-mail invalido.").max(320).optional(),
    password: z.string().min(8).max(200).optional(),
    /** @deprecated Preferir `orgRole`. Mantido para compatibilidade. */
    isAdmin: z.boolean().optional(),
    /** @deprecated Tratado como gestor; preferir `orgRole: "gestor"`. */
    isExecutive: z.boolean().optional(),
    orgRole: z.enum(["gestor", "membro", "convidado"]).optional(),
    /** Só administrador da plataforma pode alterar. */
    platformRole: z.enum(["platform_admin", "platform_user"]).optional(),
    /** Só administrador da plataforma: mover utilizador para outra organização. */
    orgId: z.string().trim().min(1).max(120).optional(),
  })
  .passthrough();

export const UserThemePreferenceSchema = z.object({
  themePreference: z.enum(["light", "dark", "system"]),
});

const brlPlanMoneySchema = z
  .number()
  .finite()
  .min(0)
  .max(1_000_000)
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, {
    message: "Use no maximo duas casas decimais (centavos).",
  });

/** Configuração global de planos (admin da plataforma). Valores em BRL com centavos (vitrine / base Stripe). */
export const PlatformCommercialSettingsPatchSchema = z.object({
  proEnabled: z.boolean(),
  businessEnabled: z.boolean(),
  proSeatMonth: brlPlanMoneySchema,
  proSeatYear: brlPlanMoneySchema,
  businessSeatMonth: brlPlanMoneySchema,
  businessSeatYear: brlPlanMoneySchema,
  /** Se true, cria novos Prices no Stripe quando valores mudam ou ainda não há ID persistido. */
  publishStripe: z.boolean().optional().default(false),
});

export type PlatformCommercialSettingsPatch = z.infer<typeof PlatformCommercialSettingsPatchSchema>;

/** Conta do admin da plataforma (seed ou platform_admin). */
export const PlatformAdminProfilePatchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    email: z.string().trim().email("E-mail invalido.").max(320).optional(),
    currentPassword: z.string().min(1).max(200).optional(),
    newPassword: z.string().min(8).max(200).optional(),
  })
  .refine(
    (d) => {
      if (d.newPassword !== undefined && d.newPassword.length > 0) {
        return Boolean(d.currentPassword && d.currentPassword.length >= 1);
      }
      return true;
    },
    { message: "Informe a senha atual para definir uma nova senha.", path: ["currentPassword"] }
  );

export const ProductTourPatchSchema = z.object({
  completed: z.boolean(),
});

const webhookEventEnum = z.enum(WEBHOOK_EVENT_TYPES);

export const WebhookSubscriptionCreateSchema = z
  .object({
    url: z.string().trim().url("URL invalida.").max(2048),
    secret: z.string().trim().min(8, "Secret deve ter ao menos 8 caracteres.").max(256).optional(),
    events: z.array(webhookEventEnum).min(1, "Selecione ao menos um evento."),
    active: z.boolean().optional(),
  })
  .passthrough();

export const WebhookSubscriptionUpdateSchema = z
  .object({
    url: z.string().trim().url("URL invalida.").max(2048).optional(),
    secret: z.string().trim().min(8).max(256).optional(),
    events: z.array(webhookEventEnum).min(1).optional(),
    active: z.boolean().optional(),
  })
  .refine((d) => d.url !== undefined || d.secret !== undefined || d.events !== undefined || d.active !== undefined, {
    message: "Informe ao menos um campo para atualizar.",
  })
  .passthrough();

// -----------------------
// Sprint Engine (v5 roadmap)
// -----------------------

export const BurndownSnapshotSchema = z.object({
  date: z.string().trim().max(10),
  remainingCards: z.number().int().min(0),
  completedToday: z.number().int().min(0),
  addedToday: z.number().int().min(0),
  idealRemaining: z.number().min(0),
});

export type BurndownSnapshot = z.infer<typeof BurndownSnapshotSchema>;

export const SprintCadenceTypeSchema = z.enum(["timebox", "continuous"]);
export type SprintCadenceType = z.infer<typeof SprintCadenceTypeSchema>;

export const SprintGoalHistoryEntrySchema = z.object({
  at: z.string().trim().max(80),
  goal: z.string().trim().max(1000),
});

/** Frozen board state at sprint close (or other capture reasons) for faithful history. */
export const SprintScopeSnapshotReasonSchema = z.enum(["closed", "review", "manual"]);
export type SprintScopeSnapshotReason = z.infer<typeof SprintScopeSnapshotReasonSchema>;

export const SprintScopeSnapshotSchema = z.object({
  capturedAt: z.string().trim().max(80),
  reason: SprintScopeSnapshotReasonSchema,
  /** Copy of `board.config.bucketOrder` at capture time. */
  bucketOrderSnapshot: z.array(z.unknown()).max(120),
  /** Deep-cloned card payloads for all ids in sprint scope at capture. */
  cards: z.array(z.unknown()).max(500),
});

export type SprintScopeSnapshot = z.infer<typeof SprintScopeSnapshotSchema>;

export const SprintDataSchema = z.object({
  id: z.string().trim().min(1).max(200),
  orgId: z.string().trim().min(1).max(200),
  boardId: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  goal: z.string().trim().max(1000).default(""),
  status: z.enum(["planning", "active", "review", "closed"]).default("planning"),
  startDate: z.string().trim().max(30).nullable().default(null),
  endDate: z.string().trim().max(30).nullable().default(null),
  velocity: z.number().min(0).nullable().default(null),
  cardIds: z.array(z.string().trim().max(200)).default([]),
  doneCardIds: z.array(z.string().trim().max(200)).default([]),
  ceremonyIds: z.array(z.string().trim().max(200)).default([]),
  burndownSnapshots: z.array(BurndownSnapshotSchema).max(90).default([]),
  addedMidSprint: z.array(z.string().trim().max(200)).default([]),
  removedCardIds: z.array(z.string().trim().max(200)).default([]),
  /** Timebox (Scrum) vs fluxo contínuo (Kanban). */
  cadenceType: SprintCadenceTypeSchema.default("timebox"),
  /** Dias entre reviews de cadência (Kanban). */
  reviewCadenceDays: z.number().int().min(1).max(365).nullable().default(null),
  wipPolicyNote: z.string().trim().max(500).default(""),
  /** Capacidade planejada (ex.: story points ou itens). */
  plannedCapacity: z.number().min(0).nullable().default(null),
  commitmentNote: z.string().trim().max(1000).default(""),
  definitionOfDoneItemIds: z.array(z.string().trim().max(80)).max(20).default([]),
  sprintGoalHistory: z.array(SprintGoalHistoryEntrySchema).max(30).default([]),
  programIncrementId: z.string().trim().max(200).nullable().default(null),
  sprintTags: z.array(z.string().trim().max(60)).max(20).default([]),
  customFields: z.record(z.string().trim().max(60), z.string().trim().max(500)).default({}),
  /** Optional frozen scope for closed/historical sprints (see sprint close flow). */
  scopeSnapshot: SprintScopeSnapshotSchema.optional(),
  createdAt: z.string().trim().max(80),
  updatedAt: z.string().trim().max(80),
});

export type SprintData = z.infer<typeof SprintDataSchema>;

export const SprintCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  goal: z.string().trim().max(1000).optional(),
  startDate: z.string().trim().max(30).nullable().optional(),
  endDate: z.string().trim().max(30).nullable().optional(),
  cardIds: z.array(z.string().trim().max(200)).optional(),
  cadenceType: SprintCadenceTypeSchema.optional(),
  reviewCadenceDays: z.number().int().min(1).max(365).nullable().optional(),
  wipPolicyNote: z.string().trim().max(500).optional(),
  plannedCapacity: z.number().min(0).nullable().optional(),
  commitmentNote: z.string().trim().max(1000).optional(),
  definitionOfDoneItemIds: z.array(z.string().trim().max(80)).max(20).optional(),
  programIncrementId: z.string().trim().max(200).nullable().optional(),
  sprintTags: z.array(z.string().trim().max(60)).max(20).optional(),
  customFields: z.record(z.string().trim().max(60), z.string().trim().max(500)).optional(),
});

export const SprintUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  goal: z.string().trim().max(1000).optional(),
  startDate: z.string().trim().max(30).nullable().optional(),
  endDate: z.string().trim().max(30).nullable().optional(),
  status: z.enum(["planning", "active", "review", "closed"]).optional(),
  cardIds: z.array(z.string().trim().max(200)).optional(),
  doneCardIds: z.array(z.string().trim().max(200)).optional(),
  velocity: z.number().min(0).nullable().optional(),
  burndownSnapshots: z.array(BurndownSnapshotSchema).max(90).optional(),
  addedMidSprint: z.array(z.string().trim().max(200)).optional(),
  removedCardIds: z.array(z.string().trim().max(200)).optional(),
  cadenceType: SprintCadenceTypeSchema.optional(),
  reviewCadenceDays: z.number().int().min(1).max(365).nullable().optional(),
  wipPolicyNote: z.string().trim().max(500).optional(),
  plannedCapacity: z.number().min(0).nullable().optional(),
  commitmentNote: z.string().trim().max(1000).optional(),
  definitionOfDoneItemIds: z.array(z.string().trim().max(80)).max(20).optional(),
  sprintGoalHistory: z.array(SprintGoalHistoryEntrySchema).max(30).optional(),
  programIncrementId: z.string().trim().max(200).nullable().optional(),
  sprintTags: z.array(z.string().trim().max(60)).max(20).optional(),
  customFields: z.record(z.string().trim().max(60), z.string().trim().max(500)).optional(),
});

// -----------------------
// Card Comments (v5 roadmap)
// -----------------------

export const CommentReactionSchema = z.object({
  emoji: z.string().trim().max(10),
  userId: z.string().trim().max(200),
});

export const CommentSchema = z.object({
  id: z.string().trim().min(1).max(100),
  cardId: z.string().trim().min(1).max(200),
  boardId: z.string().trim().min(1).max(200),
  orgId: z.string().trim().min(1).max(200),
  authorId: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(2000),
  parentCommentId: z.string().trim().max(100).nullable().default(null),
  reactions: z.array(CommentReactionSchema).max(200).default([]),
  mentions: z.array(z.string().trim().max(200)).default([]),
  isAiGenerated: z.boolean().default(false),
  createdAt: z.string().trim().max(80),
  editedAt: z.string().trim().max(80).nullable().default(null),
});

export type CommentData = z.infer<typeof CommentSchema>;

export const CommentCreateSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  parentCommentId: z.string().trim().max(100).nullable().optional(),
  mentions: z.array(z.string().trim().max(200)).optional(),
});

// -----------------------
// Fluxy Internal Messages
// -----------------------

export const FluxyConversationScopeSchema = z.enum(["board", "card", "direct"]);

export const FluxyParticipantSchema = z.object({
  userId: z.string().trim().min(1).max(200),
  role: z.enum(["gestor", "membro", "convidado"]),
});

export const FluxyMentionSchema = z.object({
  token: z.string().trim().min(1).max(80),
  userId: z.string().trim().max(200).nullable().default(null),
  kind: z.enum(["explicit", "implicit"]).default("explicit"),
});

export const FluxyMessageSchema = z.object({
  id: z.string().trim().min(1).max(100),
  orgId: z.string().trim().min(1).max(200),
  boardId: z.string().trim().min(1).max(200),
  conversationScope: FluxyConversationScopeSchema,
  relatedCardId: z.string().trim().max(200).nullable().default(null),
  /** Contexto de card na sala do board (thread continua indexada como `relatedCardId: null`). */
  contextCardId: z.string().trim().max(200).nullable().default(null),
  body: z.string().trim().min(1).max(4000),
  participants: z.array(FluxyParticipantSchema).max(100).default([]),
  mentions: z.array(FluxyMentionSchema).max(100).default([]),
  targetUserIds: z.array(z.string().trim().max(200)).max(100).default([]),
  createdBy: z.object({
    userId: z.string().trim().min(1).max(200),
    role: z.enum(["gestor", "membro", "convidado"]),
  }),
  mediatedByFluxy: z.boolean().default(false),
  createdAt: z.string().trim().max(80),
});

export const FluxyMessageCreateSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  conversationScope: FluxyConversationScopeSchema,
  relatedCardId: z.string().trim().max(200).nullable().optional(),
  contextCardId: z.string().trim().max(200).nullable().optional(),
  participants: z.array(FluxyParticipantSchema).max(100).optional(),
  mentions: z.array(FluxyMentionSchema).max(100).optional(),
  targetUserIds: z.array(z.string().trim().max(200)).max(100).optional(),
  mediatedByFluxy: z.boolean().optional(),
  /** Quando a API pedir confirmação para notificações inferidas, reenviar com true. */
  confirmFluxyNotify: z.boolean().optional(),
});

export type FluxyMessageData = z.infer<typeof FluxyMessageSchema>;

// -----------------------
// Time Tracking (v5 roadmap)
// -----------------------

export const TimeEntrySchema = z.object({
  id: z.string().trim().min(1).max(100),
  cardId: z.string().trim().min(1).max(200),
  boardId: z.string().trim().min(1).max(200),
  orgId: z.string().trim().min(1).max(200),
  subtaskId: z.string().trim().max(100).nullable().default(null),
  userId: z.string().trim().min(1).max(200),
  startedAt: z.string().trim().max(80),
  endedAt: z.string().trim().max(80).nullable().default(null),
  durationMinutes: z.number().min(0).max(99999).default(0),
  note: z.string().trim().max(500).default(""),
});

export type TimeEntryData = z.infer<typeof TimeEntrySchema>;

// -----------------------
// Program Increment (v5 roadmap - SAFe PI)
// -----------------------

export const ProgramIncrementSchema = z.object({
  id: z.string().trim().min(1).max(200),
  orgId: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  goal: z.string().trim().max(1000).default(""),
  status: z.enum(["planning", "executing", "review", "closed"]).default("planning"),
  startDate: z.string().trim().max(30).nullable().default(null),
  endDate: z.string().trim().max(30).nullable().default(null),
  sprintIds: z.array(z.string().trim().max(200)).default([]),
  boardIds: z.array(z.string().trim().max(200)).default([]),
  createdAt: z.string().trim().max(80),
  updatedAt: z.string().trim().max(80),
});

export type ProgramIncrementData = z.infer<typeof ProgramIncrementSchema>;

// -----------------------
// Release / Version Management
// -----------------------

export const ReleaseChangeKindSchema = z.enum([
  "feat",
  "fix",
  "chore",
  "perf",
  "docs",
  "refactor",
  "breaking",
]);
export type ReleaseChangeKind = z.infer<typeof ReleaseChangeKindSchema>;

export const ReleaseChangelogEntrySchema = z.object({
  kind: ReleaseChangeKindSchema,
  title: z.string().trim().min(1).max(240),
  cardId: z.string().trim().max(200).nullable().default(null),
  authorId: z.string().trim().max(200).nullable().default(null),
});
export type ReleaseChangelogEntry = z.infer<typeof ReleaseChangelogEntrySchema>;

export const ReleaseRiskSeveritySchema = z.enum(["low", "medium", "high", "critical"]);
export type ReleaseRiskSeverity = z.infer<typeof ReleaseRiskSeveritySchema>;

export const ReleaseRiskSchema = z.object({
  severity: ReleaseRiskSeveritySchema,
  title: z.string().trim().min(1).max(200),
  mitigation: z.string().trim().max(500).default(""),
});
export type ReleaseRisk = z.infer<typeof ReleaseRiskSchema>;

export const ReleaseTimelineEventSchema = z.object({
  at: z.string().trim().max(80),
  kind: z.enum([
    "created",
    "planned",
    "review",
    "staged",
    "released",
    "rolled_back",
    "edited",
    "ai_notes_generated",
  ]),
  by: z.string().trim().max(200).default(""),
  note: z.string().trim().max(500).default(""),
});
export type ReleaseTimelineEvent = z.infer<typeof ReleaseTimelineEventSchema>;

export const ReleaseVersionTypeSchema = z.enum(["major", "minor", "patch", "hotfix"]);
export type ReleaseVersionType = z.infer<typeof ReleaseVersionTypeSchema>;

export const ReleaseEnvironmentSchema = z.enum(["dev", "staging", "production"]);
export type ReleaseEnvironment = z.infer<typeof ReleaseEnvironmentSchema>;

export const ReleaseStatusSchema = z.enum([
  "draft",
  "planned",
  "in_review",
  "staging",
  "released",
  "rolled_back",
]);
export type ReleaseStatus = z.infer<typeof ReleaseStatusSchema>;

export const ReleaseDataSchema = z.object({
  id: z.string().trim().min(1).max(200),
  orgId: z.string().trim().min(1).max(200),
  boardId: z.string().trim().min(1).max(200),
  version: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(1000).default(""),
  versionType: ReleaseVersionTypeSchema.default("minor"),
  status: ReleaseStatusSchema.default("draft"),
  environment: ReleaseEnvironmentSchema.default("production"),
  sprintIds: z.array(z.string().trim().max(200)).max(40).default([]),
  cardIds: z.array(z.string().trim().max(200)).max(500).default([]),
  changelog: z.array(ReleaseChangelogEntrySchema).max(200).default([]),
  aiNotes: z.string().trim().max(6000).default(""),
  humanNotes: z.string().trim().max(6000).default(""),
  healthScore: z.number().min(0).max(100).nullable().default(null),
  risks: z.array(ReleaseRiskSchema).max(40).default([]),
  timeline: z.array(ReleaseTimelineEventSchema).max(120).default([]),
  deploymentRef: z.string().trim().max(400).default(""),
  previousReleaseId: z.string().trim().max(200).nullable().default(null),
  plannedAt: z.string().trim().max(80).nullable().default(null),
  releasedAt: z.string().trim().max(80).nullable().default(null),
  rolledBackAt: z.string().trim().max(80).nullable().default(null),
  rollbackReason: z.string().trim().max(500).default(""),
  tags: z.array(z.string().trim().max(60)).max(20).default([]),
  createdBy: z.string().trim().max(200).default(""),
  createdAt: z.string().trim().max(80),
  updatedAt: z.string().trim().max(80),
});
export type ReleaseData = z.infer<typeof ReleaseDataSchema>;

export const ReleaseCreateSchema = z.object({
  version: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(1000).optional(),
  versionType: ReleaseVersionTypeSchema.optional(),
  status: ReleaseStatusSchema.optional(),
  environment: ReleaseEnvironmentSchema.optional(),
  sprintIds: z.array(z.string().trim().max(200)).max(40).optional(),
  cardIds: z.array(z.string().trim().max(200)).max(500).optional(),
  changelog: z.array(ReleaseChangelogEntrySchema).max(200).optional(),
  aiNotes: z.string().trim().max(6000).optional(),
  humanNotes: z.string().trim().max(6000).optional(),
  risks: z.array(ReleaseRiskSchema).max(40).optional(),
  deploymentRef: z.string().trim().max(400).optional(),
  previousReleaseId: z.string().trim().max(200).nullable().optional(),
  plannedAt: z.string().trim().max(80).nullable().optional(),
  tags: z.array(z.string().trim().max(60)).max(20).optional(),
});
export type ReleaseCreateInput = z.infer<typeof ReleaseCreateSchema>;

export const ReleaseUpdateSchema = ReleaseCreateSchema.partial().extend({
  healthScore: z.number().min(0).max(100).nullable().optional(),
  releasedAt: z.string().trim().max(80).nullable().optional(),
  rolledBackAt: z.string().trim().max(80).nullable().optional(),
  rollbackReason: z.string().trim().max(500).optional(),
});
export type ReleaseUpdateInput = z.infer<typeof ReleaseUpdateSchema>;

