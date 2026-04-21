"use client";

import { useParams } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { BoardFluxIntelligenceView } from "@/components/kanban/board-flux-intelligence-view";

export default function BoardIntelligencePage() {
  const params = useParams();
  const { user, getHeaders, isChecked } = useAuth();
  const boardId = Array.isArray(params.id) ? params.id[0] ?? "" : (params.id as string);

  if (!isChecked) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4 text-sm text-[var(--flux-text-muted)]">…</div>
    );
  }

  if (!user || !boardId) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4 text-sm text-[var(--flux-text-muted)]">
        Acesso necessário.
      </div>
    );
  }

  return <BoardFluxIntelligenceView boardId={boardId} getHeaders={getHeaders} />;
}
