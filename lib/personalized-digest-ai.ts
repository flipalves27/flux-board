import type { LlmChatMessage } from "@/lib/llm-provider";

export type DigestFrequency = "daily" | "weekly";
export type UserRole = "developer" | "manager" | "executive" | "general";

export type DigestItem = {
  type: "anomaly" | "progress" | "deadline" | "blocked" | "achievement" | "risk";
  priority: "high" | "medium" | "low";
  title: string;
  detail: string;
  boardId?: string;
  cardId?: string;
};

export type PersonalizedDigest = {
  greeting: string;
  summary: string;
  items: DigestItem[];
  suggestion: string;
};

export type DigestContext = {
  userName: string;
  userRole: UserRole;
  assignedCards: Array<{ id: string; title: string; boardName: string; priority: string; progress: string; dueDate?: string | null; bucket: string }>;
  recentAnomalies: Array<{ message: string; boardId: string }>;
  completedRecently: number;
  blockedCards: number;
  overdueCards: number;
};

export function buildDigestMessages(ctx: DigestContext): LlmChatMessage[] {
  const roleInstructions: Record<UserRole, string> = {
    developer: "Foque em: cards atribuídos, bloqueios, deadlines próximos, e conquistas recentes.",
    manager: "Foque em: visão geral do time, riscos, anomalias, progresso das entregas, e workload balance.",
    executive: "Foque em: métricas de alto nível, riscos estratégicos, tendências, e decisões necessárias.",
    general: "Equilibre entre tarefas pessoais e visão geral do projeto.",
  };

  const cardSummary = ctx.assignedCards.slice(0, 15).map((c) =>
    `- "${c.title}" (${c.boardName}, ${c.bucket}, ${c.priority}${c.dueDate ? `, vence ${c.dueDate}` : ""})`
  ).join("\n");

  const anomalySummary = ctx.recentAnomalies.slice(0, 5).map((a) => `- ${a.message}`).join("\n");

  const system = `Você é um assistente que gera digests personalizados para usuários de um sistema de gestão de projetos.
${roleInstructions[ctx.userRole]}

Responda APENAS com JSON:
{
  "greeting": "saudação curta personalizada",
  "summary": "resumo de 1-2 frases do estado geral",
  "items": [{ "type": "anomaly|progress|deadline|blocked|achievement|risk", "priority": "high|medium|low", "title": "string", "detail": "string" }],
  "suggestion": "uma sugestão acionável para o dia"
}`;

  const user = `Usuário: ${ctx.userName}
Cards atribuídos (${ctx.assignedCards.length} total):
${cardSummary || "(nenhum)"}

Anomalias recentes:
${anomalySummary || "(nenhuma)"}

Completados recentemente: ${ctx.completedRecently}
Bloqueados: ${ctx.blockedCards}
Atrasados: ${ctx.overdueCards}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export function parseDigestResponse(text: string): PersonalizedDigest | null {
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  try {
    const obj = JSON.parse(cleaned);
    if (!obj || typeof obj !== "object") return null;

    const items: DigestItem[] = [];
    if (Array.isArray(obj.items)) {
      for (const item of obj.items.slice(0, 12)) {
        if (item && typeof item === "object" && typeof item.title === "string") {
          items.push({
            type: ["anomaly", "progress", "deadline", "blocked", "achievement", "risk"].includes(item.type) ? item.type : "progress",
            priority: ["high", "medium", "low"].includes(item.priority) ? item.priority : "medium",
            title: item.title.trim(),
            detail: typeof item.detail === "string" ? item.detail.trim() : "",
            boardId: typeof item.boardId === "string" ? item.boardId : undefined,
            cardId: typeof item.cardId === "string" ? item.cardId : undefined,
          });
        }
      }
    }

    return {
      greeting: typeof obj.greeting === "string" ? obj.greeting.trim() : `Olá, ${obj.userName ?? ""}`,
      summary: typeof obj.summary === "string" ? obj.summary.trim() : "",
      items,
      suggestion: typeof obj.suggestion === "string" ? obj.suggestion.trim() : "",
    };
  } catch {
    return null;
  }
}
