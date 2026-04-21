"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Header } from "@/components/header";
import { useAuth } from "@/context/auth-context";
import { ReleaseManager } from "@/components/releases/release-manager";
import { apiGet, ApiError } from "@/lib/api-client";

type BoardPayload = { board?: { id: string; name?: string } };

export default function BoardReleasesLocalePage() {
  const params = useParams();
  const { user, getHeaders, isChecked } = useAuth();
  const boardId = Array.isArray(params.id) ? params.id[0] ?? "" : (params.id as string);
  const [boardName, setBoardName] = useState<string | undefined>();

  useEffect(() => {
    if (!user || !boardId) return;
    apiGet<BoardPayload>(`/api/boards/${encodeURIComponent(boardId)}`, getHeaders())
      .then((data) => setBoardName(data.board?.name))
      .catch((e) => {
        if (!(e instanceof ApiError)) console.error(e);
      });
  }, [user, boardId, getHeaders]);

  if (!isChecked || !user || !boardId) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4 text-sm text-[var(--flux-text-muted)]">
        …
      </div>
    );
  }

  return (
    <>
      <Header />
      <ReleaseManager boardId={boardId} boardName={boardName} getHeaders={getHeaders} />
    </>
  );
}
