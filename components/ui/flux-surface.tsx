import type { HTMLAttributes } from "react";

const tierClass = {
  1: "flux-surface-1",
  2: "flux-surface-2",
  3: "flux-surface-3",
} as const;

export type FluxSurfaceTier = keyof typeof tierClass;

export type FluxSurfaceProps = HTMLAttributes<HTMLDivElement> & {
  tier?: FluxSurfaceTier;
};

/**
 * Superfícies semânticas Onda 4 — classes definidas em `app/globals.css`.
 */
export function FluxSurface({ tier = 1, className = "", ...rest }: FluxSurfaceProps) {
  const base = tierClass[tier];
  return <div className={`${base} ${className}`.trim()} {...rest} />;
}
