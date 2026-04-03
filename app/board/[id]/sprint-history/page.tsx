"use client";

import { useParams } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { BoardSprintHistoryView } from "@/components/sprints/board-sprint-history-view";

export default function BoardSprintHistoryPage() {
  const params = useParams();
  const { user, getHeaders, isChecked } = useAuth();
  const boardId = Array.isArray(params.id) ? params.id[0] ?? "" : (params.id as string);

  if (!isChecked || !user || !boardId) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4 text-sm text-[var(--flux-text-muted)]">
        …
      </div>
    );
  }

  return <BoardSprintHistoryView boardId={boardId} getHeaders={getHeaders} />;
}
