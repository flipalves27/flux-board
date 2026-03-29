/** Valores de vitrine (BRL/mês) alinhados ao plano estratégico v4 — Stripe continua sendo fonte da verdade para cobrança. */

export const PRICING_BRL = {
  proSeatMonth: 49,
  businessSeatMonth: 99,
  /** Desconto anual ~20% (R$/seat/mês quando faturado anualmente). */
  proSeatYear: 39,
  businessSeatYear: 79,
} as const;

/** Normaliza valor em reais para centavos (2 casas decimais). */
export function roundBrl2(n: number): number {
  if (!Number.isFinite(n)) return n;
  return Math.round(n * 100) / 100;
}

/** Compara dois valores BRL com precisão de centavo. */
export function brlCentsEqual(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

/** Formatação monetária BRL: valores inteiros sem ,00; com centavos sempre duas casas (ex.: R$ 49,90). */
export function formatBrl(n: number): string {
  const r = roundBrl2(n);
  const frac = Math.round(r * 100) % 100;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: frac !== 0 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(r);
}
