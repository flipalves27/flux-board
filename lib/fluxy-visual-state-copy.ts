import type { FluxyAvatarState } from "@/components/fluxy/fluxy-types";

const roots: Record<FluxyAvatarState, string> = {
  idle: "visualState.idle",
  thinking: "visualState.thinking",
  talking: "visualState.talking",
  celebrating: "visualState.celebrating",
  waving: "visualState.waving",
  sleeping: "visualState.sleeping",
};

export type FluxyVisualStateCopy = { emoji: string; label: string; desc: string };

/** Resolves emoji/label/desc for a Fluxy avatar state; `t` must be scoped to a namespace that defines `visualState.*`. */
export function fluxyVisualStateCopy(state: FluxyAvatarState, t: (key: string) => string): FluxyVisualStateCopy {
  const r = roots[state];
  return {
    emoji: t(`${r}.emoji`),
    label: t(`${r}.label`),
    desc: t(`${r}.desc`),
  };
}
