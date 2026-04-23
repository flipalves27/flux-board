"use client";

import { useTranslations } from "next-intl";
import { formatAiModelLabel } from "@/lib/ai-model-label";

type Props = {
  model?: string | null;
  provider?: string | null;
  className?: string;
};

function normalizeProviderKey(provider: string): string | null {
  const p = String(provider || "").trim();
  if (!p) return null;
  if (/^together$/i.test(p) || p === "openai_compat") return "openai_compat";
  return p;
}

/**
 * Indicação discreta do modelo (e opcionalmente provedor) usado numa operação de IA.
 */
export function AiModelHint({ model, provider, className = "" }: Props) {
  const t = useTranslations("aiModelHint");
  const m = formatAiModelLabel(model);
  const raw = String(provider || "").trim();
  const key = normalizeProviderKey(raw);
  const p = key === "openai_compat" ? t("openAiCompatLabel") : raw;

  const title = [
    p && `${t("providerTitle")}: ${p}`,
    model && `${t("modelTitle")}: ${model}`,
  ]
    .filter(Boolean)
    .join(" · ");

  if (!m && !p) return null;

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
