export type FluxyTelemetryEvent =
  | "fluxy_state_changed"
  | "fluxy_cta_clicked"
  | "fluxy_dock_opened"
  | "fluxy_proactive_message_viewed";

export type FluxyTelemetryPayload = {
  event: FluxyTelemetryEvent;
  mode: "board" | "workspace";
  state?: string;
  origin?: string;
  boardId?: string;
  sprintId?: string;
  metadata?: Record<string, unknown>;
};

export function trackFluxyEvent(payload: FluxyTelemetryPayload): void {
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("fluxy:telemetry", {
          detail: payload,
        })
      );
    }
  } catch {
    // no-op: telemetry cannot impact UX
  }
}

