"use client";

import { FluxAppBackdrop } from "@/components/ui/flux-app-backdrop";
import { TeamSidebar } from "./team-sidebar";

export function TeamShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex h-[100dvh] overflow-hidden">
      <FluxAppBackdrop className="absolute inset-0 z-[var(--flux-z-app-shell-bg)]" />
      <TeamSidebar />
      <main className="relative z-[var(--flux-z-app-shell-content)] flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
