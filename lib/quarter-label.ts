/** Rótulo de quarter alinhado ao Kanban OKR (`YYYY-Qn`). */
export function currentQuarterLabel(date = new Date()): string {
  const year = date.getFullYear();
  const q = Math.floor(date.getMonth() / 3) + 1;
  return `${year}-Q${q}`;
}
