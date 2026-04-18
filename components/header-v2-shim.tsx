"use client";

import { Header as BaseHeader, type HeaderProps } from "@/components/header";
import { useOrgFeaturesOptional } from "@/hooks/use-org-features";
import { useWorkbarSlot } from "@/components/shell/use-workbar-slot";

/**
 * Drop-in replacement for `@/components/header` — when `ux_v2_workbar` is on,
 * the chrome is mirrored into the shell Workbar via `useWorkbarSlot`.
 */
export function Header(props: HeaderProps) {
  const org = useOrgFeaturesOptional();
  const workbar = Boolean(org?.data?.ux_v2_workbar);
  useWorkbarSlot(workbar ? <BaseHeader {...props} embedded /> : null);
  if (workbar) return null;
  return <BaseHeader {...props} />;
}

export type { HeaderProps } from "@/components/header";
