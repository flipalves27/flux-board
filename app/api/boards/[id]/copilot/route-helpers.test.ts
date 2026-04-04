import { describe, expect, it } from "vitest";
import { copilotError, parseBoardIdOrError } from "./route-helpers";

describe("copilotError", () => {
  it("returns NextResponse with error payload and status", async () => {
    const res = copilotError("Falha", 418);
    expect(res.status).toBe(418);
    await expect(res.json()).resolves.toEqual({ error: "Falha" });
  });
});

describe("parseBoardIdOrError", () => {
  it("rejects empty board id", () => {
    const out = parseBoardIdOrError("");
    expect(out.ok).toBe(false);
  });

  it("rejects missing board id", async () => {
    const out = parseBoardIdOrError(undefined);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.response.status).toBe(400);
    await expect(out.response.json()).resolves.toEqual({ error: "ID do board é obrigatório" });
  });

  it('rejects placeholder board id "boards"', async () => {
    const out = parseBoardIdOrError("boards");
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.response.status).toBe(400);
    await expect(out.response.json()).resolves.toEqual({ error: "ID do board é obrigatório" });
  });

  it("accepts valid board id", () => {
    const out = parseBoardIdOrError("board-1");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.boardId).toBe("board-1");
  });
});

