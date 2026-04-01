export type CopilotToolName = "moveCard" | "updatePriority" | "createCard" | "generateBrief" | "notifyStakeholders";

export type CopilotAction = {
  tool: CopilotToolName;
  args: Record<string, unknown>;
};

export type CopilotToolResult = {
  tool: CopilotToolName;
  ok: boolean;
  message: string;
  data?: unknown;
};

export type CopilotModelOutput = {
  reply: string;
  actions?: CopilotAction[];
  llm?: { model?: string; provider?: string; source: "cloud" | "heuristic" };
};

export type CopilotAuthPayload = {
  id: string;
  username?: string;
  orgId: string;
  isAdmin: boolean;
  orgRole?: string;
};

export type CopilotChatHistory = {
  freeDemoUsed: number;
  messages: Array<{ role: string; content: string }>;
};

