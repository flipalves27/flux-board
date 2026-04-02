"use client";

import { FluxAppBackdrop } from "@/components/ui/flux-app-backdrop";
import { TeamSidebar } from "./team-sidebar";

export function TeamShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex h-[100dvh] overflow-hidden">
      <FluxAppBackdrop />
      <TeamSidebar />
      <main className="relative z-[1] flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
