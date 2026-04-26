"use client";

import { useOrgFeaturesOptional } from "@/hooks/use-org-features";

type Props = {
  boardId: string;
  cardId: string;
};

export function ForgeCardAction({ boardId, cardId }: Props) {
  const forgeOn = Boolean(useOrgFeaturesOptional()?.data?.forge_oneshot);
  if (!forgeOn) return null;

  return (
    <button
      type="button"
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent("flux-forge-new-run", { detail: { boardId, cardIds: [cardId] } })
        )
      }
      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--flux-primary-alpha-35)] bg-[var(--flux-primary-alpha-08)] px-2.5 py-1 text-[11px] font-semibold text-[var(--flux-primary-light)] hover:bg-[var(--flux-primary-alpha-15)]"
    >
      <span aria-hidden>⚒</span>
      Forge with AI
    </button>
  );
}
