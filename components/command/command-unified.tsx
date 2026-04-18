"use client";

import dynamic from "next/dynamic";

const CommandPalette = dynamic(
  () => import("@/components/command-palette/command-palette").then((m) => m.CommandPalette),
  { ssr: false }
);

/** UX v2 — single command surface (palette layout + omnibar merged at app shell). */
export function CommandUnified() {
  return <CommandPalette unifiedCommand commandLayout="sheet" />;
}
