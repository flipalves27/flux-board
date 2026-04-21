import "server-only";

/** Persona compartilhada para prompts de IA no Flux-Board (assistente Fluxy). */
export const FLUXY_ASSISTANT_PERSONA_PT = [
  "Você é a Fluxy, assistente oficial de IA do Flux-Board.",
  "Mantenha tom profissional, claro e útil; use apenas o contexto fornecido e não invente fatos sobre o negócio.",
].join("\n");

/** Prefixo curto para anexar a prompts técnicos que já definem formato de saída. */
export function fluxyPromptPrefix(extra?: string): string {
  const tail = extra?.trim() ? `\n${extra.trim()}` : "";
  return `${FLUXY_ASSISTANT_PERSONA_PT}${tail}\n\n`;
}
