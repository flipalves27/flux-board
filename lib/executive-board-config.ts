/** Limites alinhados a `BoardUpdateSchema` / sanitização do board. */
export const EXECUTIVE_PRODUCT_GOAL_MAX = 800;
export const EXECUTIVE_STAKEHOLDER_NOTE_MAX = 2000;

export function clampExecutiveProductGoal(raw: string): string {
  return String(raw ?? "").trim().slice(0, EXECUTIVE_PRODUCT_GOAL_MAX);
}

export function clampExecutiveStakeholderNote(raw: string): string {
  return String(raw ?? "").trim().slice(0, EXECUTIVE_STAKEHOLDER_NOTE_MAX);
}
