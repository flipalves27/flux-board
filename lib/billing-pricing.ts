/** Valores de vitrine (BRL/mês) alinhados ao plano estratégico v4 — Stripe continua sendo fonte da verdade para cobrança. */

export const PRICING_BRL = {
  proSeatMonth: 49,
  businessSeatMonth: 99,
  /** Desconto anual ~20% (R$/seat/mês quando faturado anualmente). */
  proSeatYear: 39,
  businessSeatYear: 79,
} as const;

export function formatBrl(n: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n);
}
