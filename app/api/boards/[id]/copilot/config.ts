export const FREE_DEMO_MESSAGES_LIMIT = 3;

export const COPILOT_USER_RATE_LIMIT = {
  limit: 10,
  windowMs: 60 * 60 * 1000,
} as const;

export const SSE_CHUNK_SIZE = 24;
export const SSE_CHUNK_DELAY_MS = 12;

export const COPILOT_SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
} as const;

