import { describe, expect, it } from "vitest";
import { firstBucketKey, resolveBucketKeyFromBoard } from "@/lib/spec-plan-resolve-bucket";

describe("spec-plan-resolve-bucket", () => {
  const board = {
    config: {
      bucketOrder: [
        { key: "backlog", label: "Backlog" },
        { key: "doing", label: "Em andamento" },
      ],
    },
  };

  it("resolves by key", () => {
    expect(resolveBucketKeyFromBoard(board, "doing")).toBe("doing");
  });

  it("resolves by label", () => {
    expect(resolveBucketKeyFromBoard(board, "Em andamento")).toBe("doing");
  });

  it("firstBucketKey returns first column", () => {
    expect(firstBucketKey(board)).toBe("backlog");
  });
});
