import { describe, expect, it } from "vitest";
import { validateBoardWipPutTransition } from "@/lib/board-wip";
import {
  expandBucketsWithInferredTransitionAliases,
  mergeBucketOrdersForWipResolve,
  normBucketStr,
  resolveBucketToColumnKey,
} from "@/lib/board-bucket-resolve";

describe("mergeBucketOrdersForWipResolve", () => {
  it("acumula labels antigos e novos para a mesma key", () => {
    const m = mergeBucketOrdersForWipResolve(
      [{ key: "dev", label: "Em desenvolvimento antigo", wipLimit: 5 }],
      [{ key: "dev", label: "Em desenvolvimento", wipLimit: 5 }]
    );
    expect(m[0]?.key).toBe("dev");
    expect(resolveBucketToColumnKey("Em desenvolvimento antigo", m)).toBe("dev");
    expect(resolveBucketToColumnKey("Em desenvolvimento", m)).toBe("dev");
    expect(resolveBucketToColumnKey("dev", m)).toBe("dev");
  });

  it("mantém ordem de colunas do payload (incoming) primeiro", () => {
    const m = mergeBucketOrdersForWipResolve(
      [{ key: "z", label: "Z" }],
      [
        { key: "a", label: "A" },
        { key: "b", label: "B" },
      ]
    );
    expect(m.map((x) => x.key)).toEqual(["a", "b", "z"]);
  });
});

describe("normBucketStr", () => {
  it("aplica NFC", () => {
    const c = "e\u0301"; // e + combining acute
    expect(normBucketStr(c)).toBe("\u00e9");
  });
});

describe("expandBucketsWithInferredTransitionAliases", () => {
  it("infere slug só na BD quando o PUT envia a key certa para os mesmos ids", () => {
    const merged = mergeBucketOrdersForWipResolve(
      [
        { key: "backlog", label: "Backlog" },
        { key: "desenvolvimento", label: "Em desenvolvimento", wipLimit: 5 },
      ],
      [
        { key: "backlog", label: "Backlog" },
        { key: "desenvolvimento", label: "Em desenvolvimento", wipLimit: 5 },
      ]
    );
    const prev = Array.from({ length: 23 }, (_, i) => ({
      id: `c${i}`,
      bucket: "coluna_interna_antiga_xyz",
    }));
    const next = Array.from({ length: 23 }, (_, i) => ({
      id: `c${i}`,
      bucket: "desenvolvimento",
    }));
    const expanded = expandBucketsWithInferredTransitionAliases(merged, prev, next);
    expect(resolveBucketToColumnKey("coluna_interna_antiga_xyz", expanded)).toBe("desenvolvimento");
    const wip = validateBoardWipPutTransition(expanded, prev, next);
    expect(wip.ok).toBe(true);
  });

  it("não promove Backlog para coluna destino em mass move", () => {
    const merged = mergeBucketOrdersForWipResolve(
      [
        { key: "backlog", label: "Backlog" },
        { key: "desenvolvimento", label: "Em desenvolvimento", wipLimit: 5 },
      ],
      [
        { key: "backlog", label: "Backlog" },
        { key: "desenvolvimento", label: "Em desenvolvimento", wipLimit: 5 },
      ]
    );
    const prev = Array.from({ length: 23 }, (_, i) => ({ id: `c${i}`, bucket: "Backlog" }));
    const next = Array.from({ length: 23 }, (_, i) => ({ id: `c${i}`, bucket: "desenvolvimento" }));
    const expanded = expandBucketsWithInferredTransitionAliases(merged, prev, next);
    const devCol = expanded.find((c) => c.key === "desenvolvimento");
    expect(devCol?.aliases?.some((a) => normBucketStr(a) === normBucketStr("Backlog"))).toBeFalsy();
    const wip = validateBoardWipPutTransition(expanded, prev, next);
    expect(wip.ok).toBe(false);
  });
});
