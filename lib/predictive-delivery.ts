export interface DeliveryPrediction {
  estimatedDate: string;
  confidencePercent: number;
  isLate: boolean;
  daysRemaining: number;
}

/**
 * Predict delivery date for an active card using historical cycle-time data.
 * Returns null when the card is already completed or lacks timing data.
 *
 * Algorithm: sort historical cycle days, pick P75 as the estimated duration,
 * add that to `columnEnteredAt`, and compare against `dueDate`.
 * Confidence scales with sample size (min 30 % at n=1, asymptotic 95 %).
 */
export function predictDelivery(
  card: { columnEnteredAt?: string; dueDate?: string | null; completedAt?: string },
  historicalCycleDays: number[],
): DeliveryPrediction | null {
  if (card.completedAt) return null;
  if (!card.columnEnteredAt) return null;
  if (historicalCycleDays.length === 0) return null;

  const sorted = [...historicalCycleDays].sort((a, b) => a - b);

  const p75Idx = Math.min(
    Math.ceil(sorted.length * 0.75) - 1,
    sorted.length - 1,
  );
  const estimatedCycleDays = Math.max(1, sorted[p75Idx]);

  const enteredAt = new Date(card.columnEnteredAt);
  if (Number.isNaN(enteredAt.getTime())) return null;

  const estimatedMs = enteredAt.getTime() + estimatedCycleDays * 86_400_000;
  const estimatedDate = new Date(estimatedMs);

  const nowMs = Date.now();
  const daysRemaining = Math.round((estimatedMs - nowMs) / 86_400_000);

  let isLate = false;
  if (card.dueDate) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(card.dueDate);
    if (m) {
      const dueMs = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      isLate = estimatedMs > dueMs;
    }
  }

  const n = sorted.length;
  const confidencePercent = Math.round(Math.min(95, 30 + 65 * (1 - 1 / (1 + n / 5))));

  const iso = estimatedDate.toISOString().slice(0, 10);
  return { estimatedDate: iso, confidencePercent, isLate, daysRemaining };
}
