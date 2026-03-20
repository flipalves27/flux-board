import { Suspense } from "react";

export default function EmbedTokenLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-[200px] flex items-center justify-center p-6 text-[var(--flux-text-muted)] text-sm">
          Carregando widget…
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
