import { NextResponse } from "next/server";

export function copilotError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function parseBoardIdOrError(boardId: string | undefined): { ok: true; boardId: string } | { ok: false; response: NextResponse } {
  if (!boardId || boardId === "boards") {
    return { ok: false, response: copilotError("ID do board é obrigatório", 400) };
  }
  return { ok: true, boardId };
}

