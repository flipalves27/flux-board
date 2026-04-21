type SprintLifecycleEvent =
  | "sprint_start"
  | "sprint_complete_to_review"
  | "sprint_close_with_carryover";

type SprintLifecycleObservabilityPayload = {
  event: SprintLifecycleEvent;
  orgId: string;
  boardId: string;
  sprintId: string;
  velocity?: number;
  doneCount?: number;
  carryoverCount?: number;
};

export function logSprintLifecycleEvent(payload: SprintLifecycleObservabilityPayload): void {
  console.info(
    JSON.stringify({
      scope: "sprint_lifecycle",
      at: new Date().toISOString(),
      ...payload,
    })
  );
}

