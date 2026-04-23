import { z } from "zod";

const intentKindEnum = z.enum([
  "nav_boards",
  "nav_portfolio",
  "nav_routines",
  "nav_equipe",
  "open_command_palette",
  "board_copilot",
  "board_nlq",
  "board_new_card",
  "unknown",
]);

export const fluxyClassifyRequestSchema = z.object({
  text: z.string().max(2000),
  locale: z.enum(["pt-BR", "en"]).optional(),
  context: z
    .object({
      pathname: z.string().max(2048).optional(),
      boardId: z.string().max(200).optional(),
      localOnly: z.boolean().optional(),
    })
    .optional(),
});

export type FluxyClassifyRequest = z.infer<typeof fluxyClassifyRequestSchema>;

export const fluxyLlmIntentSchema = z.object({
  kind: intentKindEnum,
  confidence: z.number().min(0).max(1),
  speech: z.string().max(500).optional(),
});

export type FluxyLlmIntentPayload = z.infer<typeof fluxyLlmIntentSchema>;

export const fluxyClassifyResponseSchema = z.object({
  intent: intentKindEnum,
  speech: z.string(),
  results: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      subtitle: z.string().optional(),
      action: z.discriminatedUnion("type", [
        z.object({ type: z.literal("navigate"), path: z.string() }),
        z.object({
          type: z.literal("event"),
          name: z.enum(["flux-open-command-palette", "flux-open-fluxy-omnibar"]),
          detail: z.record(z.string(), z.string()).optional(),
        }),
      ]),
    })
  ),
  meta: z.object({
    costHint: z.enum(["none", "low", "medium", "high"]),
    classifierTier: z.enum(["local", "compat_fast", "compat_full"]),
    confidence: z.number(),
    locale: z.string(),
    budgetBlocked: z.boolean().optional(),
    cacheHit: z.boolean().optional(),
  }),
});
