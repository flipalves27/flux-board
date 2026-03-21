"use client";

import { formatAiModelLabel } from "@/lib/ai-model-label";

type Props = {
  model?: string | null;
  provider?: string | null;
  className?: string;
};

/**
 * Indicação discreta do modelo (e opcionalmente provedor) usado numa operação de IA.
 */
export function AiModelHint({ model, provider, className = "" }: Props) {
  const m = formatAiModelLabel(model);
  const p = String(provider || "").trim();
  if (!m && !p) return null;

  const title = [p && `Provider: ${p}`, model && `Modelo: ${model}`].filter(Boolean).join(" · ");

  return (
    <span
      className={`inline-block text-[10px] leading-tight text-[var(--flux-text-muted)] opacity-[0.72] tabular-nums ${className}`}
      title={title || undefined}
    >
      {p ? <span className="font-medium opacity-90">{p}</span> : null}
      {p && m ? <span className="mx-1 opacity-50">·</span> : null}
      {m ? <span className="font-mono">{m}</span> : null}
    </span>
  );
}
