import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import jwt from "jsonwebtoken";
import { createToken, verifyToken } from "./auth";

describe("JWT HS256 enforcement", () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    process.env = { ...envSnapshot };
    process.env.JWT_SECRET = "vitest-jwt-secret-placeholder-min-32chars!";
  });

  afterEach(() => {
    process.env = { ...envSnapshot };
    vi.restoreAllMocks();
  });

  it("verifyToken accepts tokens signed by createToken", () => {
    const token = createToken({
      id: "u1",
      username: "alice",
      orgId: "o1",
      isAdmin: false,
    });
    const payload = verifyToken(token);
    expect(payload?.id).toBe("u1");
    expect(payload?.username).toBe("alice");
  });

  it("verifyToken rejects tokens signed with a non-HS256 algorithm", () => {
    const secret = process.env.JWT_SECRET!;
    const rogue = jwt.sign(
      { id: "attacker", username: "x", isAdmin: true, orgId: "o1" },
      secret,
      { algorithm: "HS512", expiresIn: "1h" }
    );
    expect(verifyToken(rogue)).toBeNull();
  });
});
