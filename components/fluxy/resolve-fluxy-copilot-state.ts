import type { FluxyAvatarState } from "@/components/fluxy/fluxy-types";

export type ResolveFluxyCopilotStateInput = {
  panelOpen: boolean;
  loadingHistory: boolean;
  generating: boolean;
  /** Content of the in-flight assistant message (last assistant in list while streaming). */
  lastAssistantContent: string;
  /** True during first-open welcome window (session). */
  waving: boolean;
  /** True briefly after a successful reply. */
  celebrating: boolean;
  /** True briefly after a stream or send failure (error gesture). */
  errorFlash?: boolean;
};

export function resolveFluxyCopilotState(p: ResolveFluxyCopilotStateInput): FluxyAvatarState {
  if (p.celebrating) return "celebrating";
  if (p.waving) return "waving";
  if (p.errorFlash) return "error";
  if (!p.panelOpen) {
    if (p.generating) return p.lastAssistantContent.trim().length > 0 ? "talking" : "thinking";
    return "sleeping";
  }
  if (p.loadingHistory) return "loading";
  if (p.generating) {
    return p.lastAssistantContent.trim().length > 0 ? "talking" : "thinking";
  }
  return "idle";
}
