import type { BoardData } from "@/lib/kv-boards";

export type BoardHealthDimension = {
  name: string;
  score: number;
  maxScore: number;
  details: string;
};

export type BoardHealthScore = {
  overall: number;
  grade: "A" | "B" | "C" | "D" | "F";
  dimensions: BoardHealthDimension[];
  topIssues: string[];
  topStrengths: string[];
  generatedAt: string;
};

function scoreWIPCompliance(cards: Array<Record<string, unknown>>): BoardHealthDimension {
  const active = cards.filter((c) => !["Concluída", "Done", "Closed", "Cancelada"].includes(String(c.progress ?? "")));
  const columns = new Map<string, number>();
  for (const c of active) {
    const col = String(c.progress ?? "Unknown");
    columns.set(col, (columns.get(col) ?? 0) + 1);
  }
  const maxWip = Math.max(...Array.from(columns.values()), 0);
  const score = maxWip <= 5 ? 25 : maxWip <= 10 ? 18 : maxWip <= 20 ? 10 : 3;
  return {
    name: "WIP Compliance",
    score,
    maxScore: 25,
    details: `Máximo ${maxWip} cards em uma coluna. WIP ideal ≤ 5 por coluna.`,
  };
}

function scoreFlowEfficiency(cards: Array<Record<string, unknown>>): BoardHealthDimension {
  const done = cards.filter((c) => ["Concluída", "Done", "Closed"].includes(String(c.progress ?? "")));
  let cycleDays: number[] = [];
  for (const c of done) {
    if (c.createdAt && c.updatedAt) {
      const days = (new Date(String(c.updatedAt)).getTime() - new Date(String(c.createdAt)).getTime()) / 86400000;
      if (days > 0 && days < 180) cycleDays.push(days);
    }
  }
  const avgCycle = cycleDays.length > 0 ? cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length : null;
  const score = avgCycle === null ? 10 : avgCycle <= 3 ? 25 : avgCycle <= 7 ? 20 : avgCycle <= 14 ? 13 : 5;
  return {
    name: "Flow Efficiency",
    score,
    maxScore: 25,
    details: avgCycle ? `Ciclo médio: ${Math.round(avgCycle)} dias (${cycleDays.length} cards concluídos).` : "Dados insuficientes para calcular tempo de ciclo.",
  };
}

function scoreBlockedCards(cards: Array<Record<string, unknown>>): BoardHealthDimension {
  const active = cards.filter((c) => !["Concluída", "Done", "Closed", "Cancelada"].includes(String(c.progress ?? "")));
  const blocked = active.filter((c) => {
    const tags = Array.isArray(c.tags) ? (c.tags as string[]) : [];
    return tags.some((t) => t.toLowerCase().includes("bloqueado") || t.toLowerCase().includes("blocked"));
  });
  const ratio = active.length > 0 ? blocked.length / active.length : 0;
  const score = ratio === 0 ? 25 : ratio <= 0.05 ? 22 : ratio <= 0.1 ? 16 : ratio <= 0.2 ? 8 : 2;
  return {
    name: "Blocked Cards",
    score,
    maxScore: 25,
    details: `${blocked.length} cards bloqueados (${Math.round(ratio * 100)}% do fluxo ativo).`,
  };
}

function scoreAging(cards: Array<Record<string, unknown>>): BoardHealthDimension {
  const now = Date.now();
  const active = cards.filter((c) => !["Concluída", "Done", "Closed", "Cancelada"].includes(String(c.progress ?? "")));
  const old = active.filter((c) => {
    if (!c.createdAt) return false;
    const days = (now - new Date(String(c.createdAt)).getTime()) / 86400000;
    return days > 21;
  });
  const ratio = active.length > 0 ? old.length / active.length : 0;
  const score = ratio === 0 ? 25 : ratio <= 0.1 ? 20 : ratio <= 0.2 ? 13 : ratio <= 0.35 ? 6 : 2;
  return {
    name: "Aging WIP",
    score,
    maxScore: 25,
    details: `${old.length} cards com mais de 21 dias sem conclusão (${Math.round(ratio * 100)}% do WIP).`,
  };
}

function gradeFromScore(score: number): BoardHealthScore["grade"] {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

export function computeBoardHealthScore(board: BoardData): BoardHealthScore {
  const cards = Array.isArray(board.cards) ? (board.cards as Array<Record<string, unknown>>) : [];

  const dims = [
    scoreWIPCompliance(cards),
    scoreFlowEfficiency(cards),
    scoreBlockedCards(cards),
    scoreAging(cards),
  ];

  const total = dims.reduce((s, d) => s + d.score, 0);
  const maxTotal = dims.reduce((s, d) => s + d.maxScore, 0);
  const overall = Math.round((total / maxTotal) * 100);

  const sorted = [...dims].sort((a, b) => (b.score / b.maxScore) - (a.score / a.maxScore));
  const topStrengths = sorted.slice(0, 2).map((d) => `${d.name}: ${Math.round((d.score / d.maxScore) * 100)}%`);
  const topIssues = sorted.slice(-2).reverse().map((d) => `${d.name}: ${d.details}`);

  return {
    overall,
    grade: gradeFromScore(overall),
    dimensions: dims,
    topIssues,
    topStrengths,
    generatedAt: new Date().toISOString(),
  };
}
