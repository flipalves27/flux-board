"use client";

import { TeamSidebar } from "./team-sidebar";

export function TeamShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[100dvh] overflow-hidden bg-[var(--flux-surface-dark)]">
      <TeamSidebar />
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--flux-surface-dark)]">{children}</main>
    </div>
  );
}
