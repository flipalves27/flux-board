/**
 * Named surface variants for the sticky board chrome (Flux tokens).
 * Use with `boardChromeStickyRootClass` on the outer sticky wrapper.
 */
export type BoardChromeSurfaceVariant = "glass" | "flat";

export function boardChromeStickyRootClass(variant: BoardChromeSurfaceVariant): string {
  const motion =
    "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-200";
  const sticky =
    "sticky top-[min(8rem,calc(env(safe-area-inset-top,0px)+6.75rem))] md:top-[42px] z-[var(--flux-z-board-sticky-chrome)] flex flex-col rounded-none border-x-0 border-t-0";

  if (variant === "glass") {
    return `${sticky} flux-glass-surface border-b-[var(--flux-glass-surface-border)] flux-depth-2 ${motion}`;
  }

  return `${sticky} bg-[var(--flux-surface-card)] border-b border-[var(--flux-border-muted)] shadow-flux-sm ${motion}`;
}
