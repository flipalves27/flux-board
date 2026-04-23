export const HUB_MODES = ["calendar", "manager", "schedule"] as const;
export type HubMode = (typeof HUB_MODES)[number];

export function parseHubMode(v: string | null | undefined): HubMode {
  if (v === "manager" || v === "schedule" || v === "calendar") return v;
  return "calendar";
}
