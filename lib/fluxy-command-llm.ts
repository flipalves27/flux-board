import { z } from "zod";
import type { Organization } from "@/lib/kv-organizations";
import { runOrgLlmChat } from "@/lib/llm-org-chat";
import { parseJsonFromLlmContent } from "@/app/api/boards/[id]/copilot/llm-json";
import type { OrgMemberForMention } from "@/lib/fluxy-mention-routing";

export const FluxyCommandInterpretationSchema = z.object({
  intent: z.enum(["none", "notify_people", "notify_assignee", "notify_team", "other"]).default("none"),
  notifyUserIds: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  implicitTargets: z
    .array(z.enum(["assignee", "mentioned", "team", "named_user"]))
    .max(20)
    .default([]),
  suggestedBody: z.string().trim().max(2000).optional().nullable(),
  confidence: z.number().min(0).max(1).default(0),
});

export type FluxyCommandInterpretation = z.infer<typeof FluxyCommandInterpretationSchema>;

function memberIdsSet(users: OrgMemberForMention[]): Set<string> {
  return new Set(users.map((u) => u.id));
}

function heuristicNotifyInterpretation(input: {
  body: string;
  assigneeId: string | null;
}): FluxyCommandInterpretation {
  const b = String(input.body || "").toLowerCase();
  const wantsNotify = /avisa|notific|informa\s+o|informar\s+o|cobre|ping|lembra|avisar/.test(b);
  const wantsAssignee = /respons[aá]vel|assignee|dono do card|dono\b/.test(b);
  if (wantsNotify && wantsAssignee && input.assigneeId?.trim()) {
    return {
      intent: "notify_assignee",
      notifyUserIds: [input.assigneeId.trim()],
      implicitTargets: ["assignee"],
      suggestedBody: null,
      confidence: 0.45,
    };
  }
  if (wantsNotify && /equipa|equipe|time\b|team\b/.test(b)) {
    return {
      intent: "notify_team",
      notifyUserIds: [],
      implicitTargets: ["team"],
      suggestedBody: null,
      confidence: 0.35,
    };
  }
  return {
    intent: "none",
    notifyUserIds: [],
    implicitTargets: [],
    suggestedBody: null,
    confidence: 0,
  };
}

function buildMembersPromptList(users: OrgMemberForMention[]): string {
  const lines = users.slice(0, 80).map((u) => `- id=${u.id} username=${u.username} name=${u.name}`);
  return lines.join("\n");
}

/**
 * LLM JSON interpreter for Fluxy-mediated messages (notify intents + recipient IDs).
 * Falls back to lightweight heuristics when the model is unavailable.
 */
export async function interpretFluxyCommandWithLlm(input: {
  org: Organization | null;
  orgId: string;
  userId: string;
  isAdmin: boolean;
  body: string;
  boardId: string;
  contextCardId: string | null;
  orgUsers: OrgMemberForMention[];
  assigneeId: string | null;
}): Promise<{ ok: true; data: FluxyCommandInterpretation; source: "llm" | "heuristic" } | { ok: false; error: string }> {
  const valid = memberIdsSet(input.orgUsers);
  const fallback = (): FluxyCommandInterpretation => {
    const h = heuristicNotifyInterpretation({ body: input.body, assigneeId: input.assigneeId });
    const filtered = h.notifyUserIds.filter((id) => valid.has(id));
    return { ...h, notifyUserIds: filtered };
  };

  if (!input.org) {
    return { ok: true, data: fallback(), source: "heuristic" };
  }

  const system = [
    "Você classifica mensagens curtas na Sala Fluxy do Flux-Board.",
    "Responda SOMENTE com JSON válido, sem markdown.",
    "Schema: { intent: 'none'|'notify_people'|'notify_assignee'|'notify_team'|'other', notifyUserIds: string[], implicitTargets: Array<'assignee'|'mentioned'|'team'|'named_user'>, suggestedBody: string|null, confidence: number 0-1 }",
    "Regras:",
    "- Use apenas userIds que existam na lista de membros.",
    "- Se o utilizador pedir para avisar/notificar o responsável/dono do card sem @, use intent notify_assignee e deixe notifyUserIds vazio (o servidor mapeia o assignee).",
    "- notify_team: intenção genérica para equipa — deixe notifyUserIds vazio a menos que nomes específicos apareçam.",
    "- Para pessoas nomeadas sem @, inclua o id correspondente em notifyUserIds.",
    "- Se não for pedido de notificação, intent=none.",
    "",
    `boardId=${input.boardId}`,
    `contextCardId=${input.contextCardId ?? "null"}`,
    input.assigneeId ? `assigneeId=${input.assigneeId}` : "assigneeId=null",
    "",
    "Membros (id, username, nome):",
    buildMembersPromptList(input.orgUsers),
    "",
    `Mensagem: ${input.body.slice(0, 3500)}`,
  ].join("\n");

  const res = await runOrgLlmChat({
    org: input.org,
    orgId: input.orgId,
    feature: "fluxy_command",
    messages: [
      { role: "system", content: system },
      { role: "user", content: "Classifique e extraia destinatários." },
    ],
    mode: "interactive",
    userId: input.userId,
    isAdmin: input.isAdmin,
    options: { temperature: 0.15, maxTokens: 600 },
  });

  if (!res.ok) {
    return { ok: true, data: fallback(), source: "heuristic" };
  }

  const parsed = parseJsonFromLlmContent(res.assistantText || "");
  const raw = parsed.parsed && typeof parsed.parsed === "object" ? (parsed.parsed as Record<string, unknown>) : null;
  const safe = FluxyCommandInterpretationSchema.safeParse(raw);
  if (!safe.success) {
    return { ok: true, data: fallback(), source: "heuristic" };
  }

  const filteredIds = safe.data.notifyUserIds.filter((id) => valid.has(id));
  let intent = safe.data.intent;
  let implicitTargets = [...safe.data.implicitTargets];

  if ((intent === "notify_assignee" || implicitTargets.includes("assignee")) && input.assigneeId?.trim()) {
    const a = input.assigneeId.trim();
    if (!filteredIds.includes(a) && valid.has(a)) {
      filteredIds.push(a);
    }
  }

  if (intent === "none" && filteredIds.length > 0) intent = "notify_people";
  if (intent === "notify_team" && filteredIds.length === 0 && implicitTargets.includes("team")) {
    /* sem expansão automática para toda a org — mantém vazio */
  }

  return {
    ok: true,
    data: {
      ...safe.data,
      intent,
      notifyUserIds: filteredIds,
      implicitTargets,
    },
    source: "llm",
  };
}

export function shouldRunFluxyCommandLlm(mediatedByFluxy: boolean, body: string): boolean {
  if (!mediatedByFluxy) return false;
  const b = String(body || "").toLowerCase();
  return (
    /avisa|notific|informa|lembra|cobre|ping|respons[aá]vel|assignee|equipa|equipe|time\b|team\b|@\w/.test(b) ||
    b.includes("/")
  );
}
