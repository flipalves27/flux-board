"use client";

import { useState } from "react";

type TriageSuggestionData = {
  priority: string | null;
  bucket: string | null;
  tags: string[];
  confidence: number;
  reasoning: string;
};

type CardTriageSuggestionProps = {
  suggestion: TriageSuggestionData;
  onAccept: (data: TriageSuggestionData) => void;
  onDismiss: () => void;
};

export function CardTriageSuggestion({ suggestion, onAccept, onDismiss }: CardTriageSuggestionProps) {
  const [accepted, setAccepted] = useState(false);

  if (accepted) return null;

  const confidenceLabel = suggestion.confidence >= 0.7 ? "Alta" : suggestion.confidence >= 0.4 ? "Média" : "Baixa";

  return (
    <div className="rounded-xl border border-[var(--flux-primary-alpha-30)] bg-[var(--flux-primary-alpha-06)] p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-[var(--flux-primary)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          <span className="font-display text-xs font-bold text-[var(--flux-text)]">Triagem IA</span>
          <span className="rounded-full bg-[var(--flux-chrome-alpha-08)] px-2 py-0.5 text-[10px] text-[var(--flux-text-muted)]">
            Confiança: {confidenceLabel}
          </span>
        </div>
        <button type="button" onClick={onDismiss} className="text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="mt-3 space-y-1.5 text-xs text-[var(--flux-text)]">
        {suggestion.priority && <p>Prioridade sugerida: <strong>{suggestion.priority}</strong></p>}
        {suggestion.bucket && <p>Coluna sugerida: <strong>{suggestion.bucket}</strong></p>}
        {suggestion.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            Tags:
            {suggestion.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-[var(--flux-chrome-alpha-10)] px-2 py-0.5 text-[10px]">{tag}</span>
            ))}
          </div>
        )}
        {suggestion.reasoning && <p className="text-[var(--flux-text-muted)] italic">{suggestion.reasoning}</p>}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => { setAccepted(true); onAccept(suggestion); }}
          className="btn-primary text-xs px-3 py-1.5"
        >
          Aceitar sugestões
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="btn-secondary text-xs px-3 py-1.5"
        >
          Descartar
        </button>
      </div>
    </div>
  );
}
