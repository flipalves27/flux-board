"use client";

import { useEffect } from "react";
import { useCopilotStore } from "@/stores/copilot-store";
import { useDocksStore } from "@/stores/docks-store";

/** Keeps legacy Copilot open state aligned with the UX v2 docks store. */
export function DocksStoreBridge() {
  const copilotOpen = useCopilotStore((s) => s.open);
  const setOpenDock = useDocksStore((s) => s.setOpenDock);

  useEffect(() => {
    setOpenDock(copilotOpen ? "context" : null);
  }, [copilotOpen, setOpenDock]);

  return null;
}
