"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useAuth } from "@/context/auth-context";
import { apiFetch, getApiHeaders } from "@/lib/api-client";

type WizardStep = "context" | "methodology" | "team_size" | "generating" | "done";

type ProjectContext = {
  projectType: string;
  methodology: "scrum" | "kanban";
  teamSize: "solo" | "small" | "medium" | "large";
  description: string;
};

const PROJECT_TYPES = [
  { id: "software", label: "Desenvolvimento de Software", icon: "💻" },
  { id: "marketing", label: "Marketing / Campanhas", icon: "📢" },
  { id: "operations", label: "Operações / Processos", icon: "⚙️" },
  { id: "sales", label: "Vendas / Comercial", icon: "💼" },
  { id: "product", label: "Produto / Discovery", icon: "🎯" },
  { id: "other", label: "Outro", icon: "📋" },
];

const TEAM_SIZES = [
  { id: "solo" as const, label: "Só eu", desc: "1 pessoa" },
  { id: "small" as const, label: "Time pequeno", desc: "2-5 pessoas" },
  { id: "medium" as const, label: "Time médio", desc: "6-15 pessoas" },
  { id: "large" as const, label: "Time grande", desc: "16+ pessoas" },
];

export function AiSetupWizard() {
  const { getHeaders } = useAuth();
  const router = useRouter();
  const locale = useLocale();

  const [step, setStep] = useState<WizardStep>("context");
  const [context, setContext] = useState<ProjectContext>({
    projectType: "",
    methodology: "kanban",
    teamSize: "small",
    description: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [generatedBoardId, setGeneratedBoardId] = useState<string | null>(null);

  const generateBoard = useCallback(async () => {
    setStep("generating");
    setError(null);
    try {
      const prompt = `Crie um board para: ${context.projectType}. Metodologia: ${context.methodology}. Tamanho do time: ${context.teamSize}. Descrição: ${context.description || "projeto geral"}`;
      const res = await apiFetch("/api/templates/ai-generate", {
        method: "POST",
        headers: getApiHeaders(getHeaders()),
        body: JSON.stringify({ prompt, methodology: context.methodology }),
      });
      const data = await res.json();
      if (data.boardId) {
        setGeneratedBoardId(data.boardId);
        setStep("done");
      } else {
        setError("Não foi possível gerar o board. Tente novamente.");
        setStep("team_size");
      }
    } catch {
      setError("Erro ao gerar o board. Tente novamente.");
      setStep("team_size");
    }
  }, [context, getHeaders]);

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-8 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--flux-primary-alpha-30)] bg-[var(--flux-primary-alpha-08)] px-4 py-1.5">
          <svg className="h-4 w-4 text-[var(--flux-primary)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          <span className="text-xs font-semibold text-[var(--flux-primary)]">Configuração com IA</span>
        </div>
        <h2 className="font-display text-2xl font-bold text-[var(--flux-text)]">Configure seu primeiro board</h2>
        <p className="mt-2 text-sm text-[var(--flux-text-muted)]">A IA vai criar um board personalizado baseado no seu contexto.</p>
      </div>

      {step === "context" && (
        <div className="space-y-4">
          <p className="text-sm font-semibold text-[var(--flux-text)]">Qual é o tipo do seu projeto?</p>
          <div className="grid grid-cols-2 gap-3">
            {PROJECT_TYPES.map((pt) => (
              <button
                key={pt.id}
                type="button"
                onClick={() => { setContext((c) => ({ ...c, projectType: pt.id })); setStep("methodology"); }}
                className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${
                  context.projectType === pt.id
                    ? "border-[var(--flux-primary-alpha-45)] bg-[var(--flux-primary-alpha-08)]"
                    : "border-[var(--flux-chrome-alpha-10)] hover:border-[var(--flux-chrome-alpha-20)]"
                }`}
              >
                <span className="text-xl">{pt.icon}</span>
                <span className="text-sm font-medium text-[var(--flux-text)]">{pt.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === "methodology" && (
        <div className="space-y-4">
          <p className="text-sm font-semibold text-[var(--flux-text)]">Qual metodologia usar?</p>
          <div className="grid grid-cols-2 gap-3">
            {(["kanban", "scrum"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setContext((c) => ({ ...c, methodology: m })); setStep("team_size"); }}
                className={`rounded-2xl border p-5 text-left transition-colors ${
                  context.methodology === m
                    ? "border-[var(--flux-primary-alpha-45)] bg-[var(--flux-primary-alpha-08)]"
                    : "border-[var(--flux-chrome-alpha-10)] hover:border-[var(--flux-chrome-alpha-20)]"
                }`}
              >
                <p className="font-display text-sm font-bold text-[var(--flux-text)]">{m === "kanban" ? "Kanban" : "Scrum"}</p>
                <p className="mt-1 text-xs text-[var(--flux-text-muted)]">
                  {m === "kanban" ? "Fluxo contínuo, WIP limits, classes de serviço." : "Sprints, cerimônias, velocity, story points."}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === "team_size" && (
        <div className="space-y-4">
          <p className="text-sm font-semibold text-[var(--flux-text)]">Tamanho do time?</p>
          <div className="grid grid-cols-2 gap-3">
            {TEAM_SIZES.map((ts) => (
              <button
                key={ts.id}
                type="button"
                onClick={() => setContext((c) => ({ ...c, teamSize: ts.id }))}
                className={`rounded-2xl border p-4 text-left transition-colors ${
                  context.teamSize === ts.id
                    ? "border-[var(--flux-primary-alpha-45)] bg-[var(--flux-primary-alpha-08)]"
                    : "border-[var(--flux-chrome-alpha-10)] hover:border-[var(--flux-chrome-alpha-20)]"
                }`}
              >
                <p className="text-sm font-medium text-[var(--flux-text)]">{ts.label}</p>
                <p className="text-xs text-[var(--flux-text-muted)]">{ts.desc}</p>
              </button>
            ))}
          </div>
          <div className="mt-4">
            <textarea
              value={context.description}
              onChange={(e) => setContext((c) => ({ ...c, description: e.target.value }))}
              placeholder="Descreva brevemente seu projeto (opcional)..."
              className="w-full resize-none rounded-xl border border-[var(--flux-chrome-alpha-10)] bg-transparent px-3 py-2 text-sm text-[var(--flux-text)] placeholder:text-[var(--flux-text-muted)]"
              rows={3}
            />
          </div>
          {error && <p className="text-xs text-[var(--flux-danger)]">{error}</p>}
          <button type="button" onClick={generateBoard} className="btn-primary w-full">
            Gerar board com IA
          </button>
        </div>
      )}

      {step === "generating" && (
        <div className="py-12 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[var(--flux-primary-alpha-30)] border-t-[var(--flux-primary)]" />
          <p className="mt-4 text-sm text-[var(--flux-text-muted)]">Gerando seu board personalizado...</p>
        </div>
      )}

      {step === "done" && generatedBoardId && (
        <div className="py-8 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--flux-success)]/15">
            <svg className="h-7 w-7 text-[var(--flux-success)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="font-display text-lg font-bold text-[var(--flux-text)]">Board criado!</h3>
          <p className="mt-2 text-sm text-[var(--flux-text-muted)]">Seu board personalizado está pronto para uso.</p>
          <button
            type="button"
            onClick={() => router.push(`/${locale}/board/${generatedBoardId}`)}
            className="btn-primary mt-6"
          >
            Abrir meu board
          </button>
        </div>
      )}
    </div>
  );
}
