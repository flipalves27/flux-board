/**
 * Reduz risco de prompt injection em entradas de usuário antes de enviar ao LLM.
 * Não substitui isolamento de dados no servidor (world snapshot só do board autorizado).
 */

const INJECTION_PATTERNS: RegExp[] = [
  /\bignore\s+(all\s+)?(previous|prior|above)\s+instructions?\b/gi,
  /\bdisregard\s+(the\s+)?(system|developer)\b/gi,
  /\b(system|developer)\s*:\s*/gi,
  /\byou\s+are\s+now\b/gi,
  /\bnew\s+instructions?\s*:/gi,
  /\[\s*INST\s*\]/gi,
  /<\s*\/\s*system\s*>/gi,
];

const MAX_LEN = 16000;

export type PromptGuardResult = {
  text: string;
  /** True se algum trecho suspeito foi removido ou truncado. */
  sanitized: boolean;
};

/**
 * Remove trechos comuns de tentativa de sobreposição de instruções e limita tamanho.
 */
export function guardUserPromptForLlm(raw: string): PromptGuardResult {
  let text = String(raw ?? "");
  let sanitized = false;

  if (text.length > MAX_LEN) {
    text = text.slice(0, MAX_LEN);
    sanitized = true;
  }

  for (const re of INJECTION_PATTERNS) {
    const next = text.replace(re, " ");
    if (next !== text) sanitized = true;
    text = next;
  }

  text = text.replace(/\s{2,}/g, " ").trim();
  return { text, sanitized };
}
