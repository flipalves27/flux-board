/** UX v2 rollout flags — JSON keys match API and env (`UX_V2_*`). */

export const UX_V2_FLAG_KEYS = [
  "ux_v2_command_unified",
  "ux_v2_workbar",
  "ux_v2_toolbar",
  "ux_v2_card_modal_v2",
] as const;

export type UxV2FeatureKey = (typeof UX_V2_FLAG_KEYS)[number];

export type UxV2Features = Record<UxV2FeatureKey, boolean>;

export const UX_V2_FLAG_DEFAULTS: UxV2Features = {
  ux_v2_command_unified: false,
  ux_v2_workbar: false,
  ux_v2_toolbar: false,
  ux_v2_card_modal_v2: false,
};
