export type FluxyNudgeKind = "stale_wip" | "check_standup";

export type FluxyNudge = {
  kind: FluxyNudgeKind;
  title: string;
  body: string;
};

const COOLDOWN_MS = 30 * 60 * 1000;

export function pickProactiveNudge(params: { wipCount: number; lastNudgeAt?: number }): FluxyNudge | null {
  const now = Date.now();
  if (params.lastNudgeAt && now - params.lastNudgeAt < COOLDOWN_MS) return null;
  if (params.wipCount > 25) {
    return {
      kind: "stale_wip",
      title: "WIP elevado",
      body: "Há muitos itens em progresso. Considere focar em terminar antes de puxar novos cards.",
    };
  }
  return null;
}
