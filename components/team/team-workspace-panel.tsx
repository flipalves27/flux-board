"use client";

/**
 * Painel principal da área Equipe — mesmo vocabulário visual de cards elevados
 * usado em Flux Docs / onboarding (borda primary, sombra, raio xl).
 */
export function TeamWorkspacePanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
      <div className="mx-auto w-full max-w-5xl">
        <div className="rounded-[var(--flux-rad-xl)] border border-[var(--flux-primary-alpha-20)] bg-[var(--flux-surface-card)] p-5 shadow-[var(--flux-shadow-elevated-card)] sm:p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
