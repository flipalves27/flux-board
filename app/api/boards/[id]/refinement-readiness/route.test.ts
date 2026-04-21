import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const getAuthFromRequest = vi.fn();
const getBoard = vi.fn();
const userCanAccessBoard = vi.fn();

vi.mock("@/lib/auth", () => ({
  getAuthFromRequest: (...args: unknown[]) => getAuthFromRequest(...args),
}));

vi.mock("@/lib/kv-boards", () => ({
  getBoard: (...args: unknown[]) => getBoard(...args),
  userCanAccessBoard: (...args: unknown[]) => userCanAccessBoard(...args),
}));

describe("GET /api/boards/[id]/refinement-readiness", () => {
  beforeEach(() => {
    getAuthFromRequest.mockReset();
    getBoard.mockReset();
    userCanAccessBoard.mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    getAuthFromRequest.mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/boards/b1/refinement-readiness");
    const res = await GET(req, { params: Promise.resolve({ id: "b1" }) });
    expect(res.status).toBe(401);
    expect(getBoard).not.toHaveBeenCalled();
  });

  it("returns 400 when board id is missing", async () => {
    getAuthFromRequest.mockResolvedValue({
      id: "u1",
      orgId: "org1",
      isAdmin: false,
    });
    const req = new NextRequest("http://localhost/api/boards//refinement-readiness");
    const res = await GET(req, { params: Promise.resolve({ id: "" }) });
    expect(res.status).toBe(400);
  });

  it("returns 403 when user cannot access board", async () => {
    getAuthFromRequest.mockResolvedValue({
      id: "u1",
      orgId: "org1",
      isAdmin: false,
    });
    userCanAccessBoard.mockResolvedValue(false);
    const req = new NextRequest("http://localhost/api/boards/b1/refinement-readiness");
    const res = await GET(req, { params: Promise.resolve({ id: "b1" }) });
    expect(res.status).toBe(403);
    expect(getBoard).not.toHaveBeenCalled();
  });

  it("returns 404 when board not found", async () => {
    getAuthFromRequest.mockResolvedValue({
      id: "u1",
      orgId: "org1",
      isAdmin: false,
    });
    userCanAccessBoard.mockResolvedValue(true);
    getBoard.mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/boards/b1/refinement-readiness");
    const res = await GET(req, { params: Promise.resolve({ id: "b1" }) });
    expect(res.status).toBe(404);
  });

  it("returns 404 when cardId is unknown", async () => {
    getAuthFromRequest.mockResolvedValue({
      id: "u1",
      orgId: "org1",
      isAdmin: false,
    });
    userCanAccessBoard.mockResolvedValue(true);
    getBoard.mockResolvedValue({
      id: "b1",
      orgId: "org1",
      cards: [{ id: "c1", title: "My task title here", desc: "x".repeat(200), progress: "Backlog" }],
    });
    const req = new NextRequest(
      "http://localhost/api/boards/b1/refinement-readiness?cardId=missing"
    );
    const res = await GET(req, { params: Promise.resolve({ id: "b1" }) });
    expect(res.status).toBe(404);
  });

  it("returns score for a single card when cardId is set", async () => {
    getAuthFromRequest.mockResolvedValue({
      id: "u1",
      orgId: "org1",
      isAdmin: false,
    });
    userCanAccessBoard.mockResolvedValue(true);
    getBoard.mockResolvedValue({
      id: "b1",
      orgId: "org1",
      cards: [{ id: "c1", title: "My task title here", desc: "x".repeat(200), progress: "Backlog" }],
    });
    const req = new NextRequest("http://localhost/api/boards/b1/refinement-readiness?cardId=c1");
    const res = await GET(req, { params: Promise.resolve({ id: "b1" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cardId).toBe("c1");
    expect(typeof json.score).toBe("number");
    expect(json.score).toBeGreaterThanOrEqual(0);
    expect(json.score).toBeLessThanOrEqual(100);
    expect(Array.isArray(json.reasons)).toBe(true);
  });

  it("returns items for all cards when cardId omitted", async () => {
    getAuthFromRequest.mockResolvedValue({
      id: "u1",
      orgId: "org1",
      isAdmin: false,
    });
    userCanAccessBoard.mockResolvedValue(true);
    getBoard.mockResolvedValue({
      id: "b1",
      orgId: "org1",
      cards: [{ id: "c1", title: "Enough chars", desc: "word ".repeat(30), progress: "Doing" }],
    });
    const req = new NextRequest("http://localhost/api/boards/b1/refinement-readiness");
    const res = await GET(req, { params: Promise.resolve({ id: "b1" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.boardId).toBe("b1");
    expect(json.items).toHaveLength(1);
    expect(json.items[0].cardId).toBe("c1");
    expect(typeof json.items[0].score).toBe("number");
  });
});
