"use client";

import type { FluxyOmnibarResultItem } from "@/lib/fluxy-intent-types";

export function executeFluxyOmnibarResult(
  item: FluxyOmnibarResultItem,
  localeRoot: string,
  push: (href: string) => void
): void {
  if (item.action.type === "navigate") {
    push(`${localeRoot}${item.action.path}`);
    return;
  }
  if (item.action.type === "event") {
    window.dispatchEvent(new CustomEvent(item.action.name, { detail: item.action.detail ?? {} }));
  }
}
