import { describe, expect, it } from "vitest";
import { chunkSpecPlainText } from "@/lib/spec-plan-chunk";

describe("chunkSpecPlainText", () => {
  it("returns empty for blank input", () => {
    const r = chunkSpecPlainText("   \n");
    expect(r.chunks).toEqual([]);
    expect(r.multiPart).toBe(false);
    expect(r.subsampled).toBe(false);
  });

  it("normalizes CRLF", () => {
    const r = chunkSpecPlainText("a\r\nb", { targetChars: 10, overlap: 0 });
    expect(r.chunks).toHaveLength(1);
    expect(r.chunks[0].text).toBe("a\nb");
  });

  it("splits long text with overlap", () => {
    const t = "x".repeat(250);
    const r = chunkSpecPlainText(t, { targetChars: 100, overlap: 20, maxChunks: 500 });
    expect(r.chunks.length).toBeGreaterThan(1);
    expect(r.multiPart).toBe(true);
    expect(r.subsampled).toBe(false);
    for (let i = 1; i < r.chunks.length; i++) {
      const prev = r.chunks[i - 1];
      const cur = r.chunks[i];
      expect(cur.charStart).toBe(prev.charEnd - 20);
    }
  });

  it("assigns stable chunkId sp-{index} before subsample", () => {
    const r = chunkSpecPlainText("hello", { targetChars: 100, overlap: 10, maxChunks: 500 });
    expect(r.chunks[0].chunkId).toBe("sp-0");
  });

  it("subsamples when over maxChunks", () => {
    const t = "y".repeat(5000);
    const r = chunkSpecPlainText(t, { targetChars: 50, overlap: 5, maxChunks: 4 });
    expect(r.chunks).toHaveLength(4);
    expect(r.subsampled).toBe(true);
    const ids = r.chunks.map((c) => c.chunkId);
    expect(new Set(ids).size).toBe(4);
  });
});
