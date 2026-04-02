import { Suspense } from "react";

export default function EmbedTokenLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate min-h-0 min-w-0 bg-[var(--flux-surface-dark)]">
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.55]"
        style={{ backgroundImage: "var(--flux-board-mesh)" }}
        aria-hidden
      />
      <div className="relative z-[1] min-h-0 min-w-0">
        <Suspense
          fallback={
            <div className="min-h-[200px] flex items-center justify-center p-6 text-[var(--flux-text-muted)] text-sm">
              Carregando widget…
            </div>
          }
        >
          {children}
        </Suspense>
      </div>
    </div>
  );
}
