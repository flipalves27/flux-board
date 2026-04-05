import { z } from "zod";

export const SpecPlanMethodologySchema = z.enum(["scrum", "kanban", "lss"]);
export type SpecPlanMethodology = z.infer<typeof SpecPlanMethodologySchema>;

const OutlineSectionSchema = z.object({
  title: z.string(),
  summary: z.string(),
  subsections: z
    .array(
      z.object({
        title: z.string(),
        summary: z.string(),
      })
    )
    .optional()
    .default([]),
});

export const OutlineLlmSchema = z.object({
  sections: z.array(OutlineSectionSchema).max(40),
  keyRequirements: z.array(z.object({ id: z.string(), text: z.string() })).max(80),
});

export const WorkItemsLlmSchema = z.object({
  methodologySummary: z.string(),
  items: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        description: z.string(),
        type: z.string(),
        suggestedTags: z.array(z.string()).optional().default([]),
      })
    )
    .max(60),
});

const SubtaskDraftSchema = z.object({
  title: z.string(),
  status: z.enum(["pending", "in_progress", "done", "blocked"]).optional().default("pending"),
});

/** Saída completa dos cards (após hidratação no servidor a partir dos work items). */
export const CardRowLlmSchema = z.object({
  workItemId: z.string(),
  title: z.string(),
  desc: z.string(),
  bucketKey: z.string(),
  bucketRationale: z.string(),
  priority: z.string(),
  progress: z.string(),
  tags: z.array(z.string()).optional().default([]),
  storyPoints: z.number().int().nullable().optional(),
  serviceClass: z.enum(["expedite", "fixed_date", "standard", "intangible"]).nullable().optional(),
  rationale: z.string(),
  blockedByTitles: z.array(z.string()).optional().default([]),
  subtasks: z.array(SubtaskDraftSchema).optional().default([]),
});

/**
 * O modelo só decide mapeamento e metadados; título, descrição e progresso vêm dos work items (hidratação).
 */
export const CardMappingSlimRowSchema = z.object({
  workItemId: z.string(),
  bucketKey: z.string(),
  bucketRationale: z.string(),
  priority: z.string(),
  tags: z.array(z.string()).optional().default([]),
  storyPoints: z.number().int().nullable().optional(),
  serviceClass: z.enum(["expedite", "fixed_date", "standard", "intangible"]).nullable().optional(),
  rationale: z.string(),
  blockedByTitles: z.array(z.string()).optional().default([]),
  subtasks: z.array(SubtaskDraftSchema).optional().default([]),
});

export const CardsSlimLlmSchema = z.object({
  cardRows: z.array(CardMappingSlimRowSchema).max(60),
});

export const SpecPlanApplyCardSchema = z.object({
  title: z.string().min(1).max(300),
  desc: z.string().max(6000).optional().default(""),
  bucketKey: z.string().min(1).max(200),
  priority: z.string().min(1).max(100),
  progress: z.string().min(1).max(100),
  tags: z.array(z.string()).max(30).optional().default([]),
  storyPoints: z.number().int().nullable().optional(),
  serviceClass: z.enum(["expedite", "fixed_date", "standard", "intangible"]).nullable().optional(),
  rationale: z.string().optional().default(""),
  blockedByTitles: z.array(z.string()).max(50).optional().default([]),
  subtasks: z.array(z.object({ title: z.string().min(1).max(300) })).max(20).optional().default([]),
});

export const SpecPlanApplyBodySchema = z.object({
  cards: z.array(SpecPlanApplyCardSchema).min(1).max(120),
});
