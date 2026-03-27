"use client";

import { useState } from "react";
import { apiPost } from "@/lib/api-client";

type Props = {
  feature: string;
  targetId: string;
  boardId?: string;
  getHeaders: () => Record<string, string>;
};

export function AiFeedbackInline({ feature, targetId, boardId, getHeaders }: Props) {
  const [sent, setSent] = useState<"up" | "down" | null>(null);

  const send = async (vote: "up" | "down") => {
    if (sent) return;
    try {
      await apiPost(
        "/api/ai/feedback",
        { feature, vote, targetId, ...(boardId ? { boardId } : {}) },
        getHeaders()
      );
      setSent(vote);
    } catch {
      setSent(null);
    }
  };

  return (
    <div className="mt-2 flex items-center gap-2 border-t border-[var(--flux-chrome-alpha-08)] pt-2">
      <span className="text-[10px] text-[var(--flux-text-muted)]">Útil?</span>
      <button
        type="button"
        title="Útil"
        className={`rounded px-2 py-0.5 text-[11px] ${sent === "up" ? "bg-[var(--flux-success)]/25" : "hover:bg-[var(--flux-chrome-alpha-08)]"}`}
        disabled={sent !== null}
        onClick={() => void send("up")}
      >
        👍
      </button>
      <button
        type="button"
        title="Não ajudou"
        className={`rounded px-2 py-0.5 text-[11px] ${sent === "down" ? "bg-[var(--flux-danger)]/20" : "hover:bg-[var(--flux-chrome-alpha-08)]"}`}
        disabled={sent !== null}
        onClick={() => void send("down")}
      >
        👎
      </button>
      {sent ? <span className="text-[10px] text-[var(--flux-text-muted)]">Obrigado</span> : null}
    </div>
  );
}
