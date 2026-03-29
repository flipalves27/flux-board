"use client";

import { useParams } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { SprintDetailView } from "@/components/sprints/sprint-detail-view";

export default function SprintDetailPage() {
  const params = useParams();
  const { user, getHeaders, isChecked } = useAuth();
  const boardId = Array.isArray(params.boardId) ? params.boardId[0] ?? "" : (params.boardId as string);
  const sprintId = Array.isArray(params.sprintId) ? params.sprintId[0] ?? "" : (params.sprintId as string);

  if (!isChecked || !user || !boardId || !sprintId) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4 text-sm text-[var(--flux-text-muted)]">
        …
      </div>
    );
  }

  return <SprintDetailView boardId={boardId} sprintId={sprintId} getHeaders={getHeaders} />;
}
