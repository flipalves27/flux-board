import type { FluxyIntentKind } from "@/lib/fluxy-intent-types";
import { classifyIntentLocalSync, classifyFluxyIntentLocalCompat } from "@/lib/fluxy-intent-local";

/** @deprecated Use `FluxyIntentKind` from `@/lib/fluxy-intent-types`. */
export type FluxyIntent = FluxyIntentKind;

export type FluxyIntentClassification = {
  intent: FluxyIntentKind;
  /** 0–1 heurística local (sem LLM). */
  confidence: number;
};

/**
 * Classificador leve (regex). Para classificação completa use `POST /api/fluxy/classify`.
 * Não importar `ai-completion-cache` aqui — evita puxar `mongodb` para o bundle do cliente.
 */
export function classifyFluxyIntentLocal(raw: string): FluxyIntentClassification {
  const r = classifyFluxyIntentLocalCompat(raw);
  return { intent: r.intent, confidence: r.confidence };
}

export { classifyIntentLocalSync } from "@/lib/fluxy-intent-local";
