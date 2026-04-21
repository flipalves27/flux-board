import type { LlmChatMessage } from "@/lib/llm-provider";

export type MeetingType = "standup" | "review" | "retrospective" | "planning" | "general";

export type ActionItem = {
  title: string;
  assignee: string | null;
  priority: string;
  type: "task" | "bug" | "improvement" | "decision";
};

export type MeetingSummary = {
  title: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: ActionItem[];
  risks: string[];
  nextSteps: string[];
};

const MEETING_CONTEXT: Record<MeetingType, string> = {
  standup: "Daily standup — foco em: o que fez, o que vai fazer, impedimentos.",
  review: "Sprint Review — foco em: o que foi entregue, demos, feedback dos stakeholders.",
  retrospective: "Retrospectiva — foco em: o que foi bem, o que melhorar, ações de melhoria.",
  planning: "Sprint Planning — foco em: itens selecionados, estimativas, compromissos do time.",
  general: "Reunião geral de equipe.",
};

export function buildMeetingSummaryMessages(
  transcript: string,
  meetingType: MeetingType,
  participants: string[]
): LlmChatMessage[] {
  const ctx = MEETING_CONTEXT[meetingType] || MEETING_CONTEXT.general;

  const system = `Você é um assistente especializado em resumir reuniões ágeis.
Tipo de reunião: ${ctx}
Participantes: ${participants.length > 0 ? participants.join(", ") : "(não informados)"}

Gere um resumo estruturado da reunião em JSON com:
- title: título curto da reunião
- keyPoints: array de pontos principais (2-6 itens)
- decisions: array de decisões tomadas (0-5 itens)
- actionItems: array de { title, assignee (nome ou null), priority ("Urgente"|"Importante"|"Média"), type ("task"|"bug"|"improvement"|"decision") }
- risks: array de riscos ou impedimentos mencionados (0-4 itens)
- nextSteps: array de próximos passos (1-4 itens)

Responda APENAS com JSON válido, sem markdown.`;

  return [
    { role: "system", content: system },
    { role: "user", content: `Transcrição da reunião:\n\n${transcript}` },
  ];
}

export function parseMeetingSummary(text: string): MeetingSummary | null {
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  try {
    const obj = JSON.parse(cleaned);
    if (!obj || typeof obj !== "object") return null;

    const asStringArray = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((s) => typeof s === "string").slice(0, 10) : [];

    const actionItems: ActionItem[] = [];
    if (Array.isArray(obj.actionItems)) {
      for (const item of obj.actionItems.slice(0, 15)) {
        if (item && typeof item === "object" && typeof item.title === "string") {
          actionItems.push({
            title: item.title.trim(),
            assignee: typeof item.assignee === "string" ? item.assignee.trim() || null : null,
            priority: typeof item.priority === "string" ? item.priority : "Média",
            type: ["task", "bug", "improvement", "decision"].includes(item.type) ? item.type : "task",
          });
        }
      }
    }

    return {
      title: typeof obj.title === "string" ? obj.title.trim() : "Resumo da reunião",
      keyPoints: asStringArray(obj.keyPoints),
      decisions: asStringArray(obj.decisions),
      actionItems,
      risks: asStringArray(obj.risks),
      nextSteps: asStringArray(obj.nextSteps),
    };
  } catch {
    return null;
  }
}
