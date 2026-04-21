import { Suspense } from "react";
import { FluxAppBackdrop } from "@/components/ui/flux-app-backdrop";

export default function EmbedTokenLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate min-h-[100dvh] min-w-0 overflow-x-hidden">
      <FluxAppBackdrop />
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
