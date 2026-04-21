/**
 * Interpretação heurística de cenários em pt-BR para previsão (auditável, sem LLM obrigatório).
 */
export type ParsedScenarioNl = {
  removeItems: number;
  capacityMultiplier: number;
  matched: string[];
};

export function parseDeliveryScenarioNl(message: string): ParsedScenarioNl {
  const raw = String(message || "").trim().toLowerCase();
  let removeItems = 0;
  let capacityMultiplier = 1;
  const matched: string[] = [];

  const removeM = raw.match(
    /(?:remove(?:r|mos)?|retir(?:ar|a|amos)?|cort(?:ar|a|amos)?|menos)\s*(?:\w+\s*){0,3}?(\d+)\s*(?:itens?|cards?|tarefas?|hist[oó]rias?)?/i
  );
  if (removeM?.[1]) {
    removeItems = Math.min(500, Math.max(0, parseInt(removeM[1], 10) || 0));
    if (removeItems > 0) matched.push(`removeItems=${removeItems}`);
  }

  const pctM = raw.match(/(\d+)\s*%?\s*(?:mais\s*)?(?:capacidade|throughput|velocidade|foco)/i);
  if (pctM?.[1]) {
    const p = parseInt(pctM[1], 10);
    if (Number.isFinite(p) && p > 0 && p <= 200) {
      capacityMultiplier = Math.round((p / 100) * 1000) / 1000;
      matched.push(`capacityMultiplier=${capacityMultiplier}`);
    }
  }

  const dobro = /\b(dobro|2x|duas\s+vezes)\b/i.test(raw);
  if (dobro) {
    capacityMultiplier = 2;
    matched.push("capacityMultiplier=2 (dobro)");
  }

  const metade = /\b(metade|0[,.]5x|50\s*%)\s*(?:de\s*)?(?:capacidade|throughput)?/i.test(raw);
  if (metade) {
    capacityMultiplier = 0.5;
    matched.push("capacityMultiplier=0.5");
  }

  return { removeItems, capacityMultiplier, matched };
}
