"use client";

import { useWorkbarContext } from "./workbar-context-provider";

const BAR_Z = "z-[var(--flux-z-workbar)]";

/** Sticky work surface chrome — consumes slots from `useWorkbarSlot`. */
export function Workbar() {
  const { slots } = useWorkbarContext();
  const nodes = Object.values(slots).filter(Boolean);

  return (
    <div
      className={`sticky top-0 ${BAR_Z} flex min-h-0 w-full flex-col border-b border-[var(--flux-border-subtle)] bg-[color-mix(in_srgb,var(--flux-surface-dark)_92%,transparent)] backdrop-blur-[12px]`}
    >
      {nodes.length > 0 ? (
        <div className="flex min-h-11 w-full min-w-0 flex-wrap items-center gap-2 px-4 py-2 sm:px-5 lg:px-6">{nodes}</div>
      ) : (
        <div className="min-h-11 w-full" aria-hidden />
      )}
    </div>
  );
}
