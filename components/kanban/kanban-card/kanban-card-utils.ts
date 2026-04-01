export type SubtaskItem = { id: string; status: "pending" | "in_progress" | "done" | "blocked" };

/** Compara apenas datas de calendário em UTC — evita divergência SSR (Node UTC) vs browser (fuso local). */
export function daysRemaining(dueDate: string | null): number | null {
  if (!dueDate) return null;
  const trimmed = dueDate.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const dueUtc = Date.UTC(y, mo - 1, d);
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((dueUtc - todayUtc) / 86400000);
}

export const LONG_PRESS_MS = 450;
export const HOVER_SHOW_MS = 200;
export const MOVE_CANCEL_PX = 10;
