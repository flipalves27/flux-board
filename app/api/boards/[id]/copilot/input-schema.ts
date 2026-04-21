import { z } from "zod";
import { sanitizeText, zodErrorToMessage } from "@/lib/schemas";
import { guardUserPromptForLlm } from "@/lib/prompt-guard";

export const CopilotChatInputSchema = z.object({
  message: z.string().trim().min(1, "Mensagem é obrigatória.").max(8000),
  debug: z.boolean().optional(),
});

export type CopilotChatInput = z.infer<typeof CopilotChatInputSchema>;

export function parseCopilotChatInput(body: unknown):
  | { ok: true; data: { userMessage: string; debugRag: boolean } }
  | { ok: false; error: string } {
  const parsed = CopilotChatInputSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: zodErrorToMessage(parsed.error) };
  }
  const debugRag = Boolean(parsed.data.debug);
  const rawMsg = sanitizeText(parsed.data.message).trim();
  const guarded = guardUserPromptForLlm(rawMsg);
  const userMessage = guarded.text;
  if (!userMessage) {
    return { ok: false, error: "Mensagem é obrigatória." };
  }
  return { ok: true, data: { userMessage, debugRag } };
}

