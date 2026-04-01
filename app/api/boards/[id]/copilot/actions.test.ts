import { describe, expect, it } from "vitest";
import { executeCopilotActions, formatAssistantReply } from "./actions";
import type { CopilotAction } from "./types";

describe("executeCopilotActions", () => {
  const board = {
    config: { bucketOrder: [{ key: "todo", label: "To do" }, { key: "doing", label: "Doing" }] },
    cards: [{ id: "c1", bucket: "todo", title: "Card A", progress: "Não iniciado", priority: "Média", order: 0 }],
  };

  it("ignores mutating action when user message is not explicit", async () => {
    const actions: CopilotAction[] = [{ tool: "moveCard", args: { cardId: "c1", bucketKey: "doing" } }];
    const out = await executeCopilotActions({
      board,
      boardId: "b1",
      actions,
      userMessage: "resuma a semana",
      generateBrief: () => "brief",
    });
    expect(out.toolResults[0]).toMatchObject({ ok: false });
  });

  it("executes generateBrief tool", async () => {
    const actions: CopilotAction[] = [{ tool: "generateBrief", args: {} }];
    const out = await executeCopilotActions({
      board,
      boardId: "b1",
      actions,
      userMessage: "resuma a semana",
      generateBrief: () => "brief semanal",
    });
    expect(out.toolResults[0]).toMatchObject({ ok: true, tool: "generateBrief" });
  });
});

describe("formatAssistantReply", () => {
  it("appends actions and brief sections", () => {
    const text = formatAssistantReply({
      reply: "Resumo",
      toolResults: [
        { tool: "generateBrief", ok: true, message: "Brief gerado.", data: { brief: "texto" } },
        { tool: "createCard", ok: true, message: "Card criado." },
      ],
    });
    expect(text).toContain("## Brief para diretoria");
    expect(text).toContain("## Ações aplicadas");
  });
});

