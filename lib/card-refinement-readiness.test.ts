import { describe, expect, it } from "vitest";
import { buildRefinementInputFromFields, computeRefinementReadinessScore } from "./card-refinement-readiness";

describe("computeRefinementReadinessScore", () => {
  it("scores done card at 100", () => {
    const r = computeRefinementReadinessScore({
      title: "X",
      desc: "y",
      progress: "Concluída",
    });
    expect(r.score).toBe(100);
  });

  it("rewards rich description and acceptance", () => {
    const r = computeRefinementReadinessScore(
      buildRefinementInputFromFields({
        title: "Feature checkout",
        descriptionText: "Critérios de aceitação:\n- usuário pode pagar\n- erro tratado\n".repeat(3),
        progress: "Não iniciado",
        storyPoints: 5,
        blockedBy: ["c_other"],
        tags: ["backend"],
      })
    );
    expect(r.score).toBeGreaterThan(60);
  });
});
