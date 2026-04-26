import { describe, expect, it } from "vitest";
import {
  BoardCreateSchema,
  ProjectAiBodySchema,
  ProjectBoardLinkSchema,
  ProjectCreateSchema,
  ProjectUpdateSchema,
} from "./schemas";
import { PLAN_FEATURE_MATRIX } from "./plan-gates";

describe("project schemas", () => {
  it("accepts a projectId when creating boards", () => {
    const parsed = BoardCreateSchema.parse({
      name: "Board operacional",
      projectId: "prj_123",
      boardMethodology: "kanban",
    });

    expect(parsed.projectId).toBe("prj_123");
    expect(parsed.boardMethodology).toBe("kanban");
  });

  it("validates governance, financials, roadmap and AI settings for projects", () => {
    const parsed = ProjectCreateSchema.parse({
      name: "Implantacao Enterprise",
      deliveryModel: "safe",
      health: "yellow",
      governance: {
        sponsor: "Diretoria",
        productOwner: "PO",
        steeringCadence: "Quinzenal",
        riskAppetite: "medium",
        approvalThresholds: ["Budget acima de 10% exige decisao registrada."],
      },
      financials: {
        budget: 250000,
        currency: "BRL",
        costModel: "value_stream",
        actualCost: 120000,
        forecastCost: 240000,
      },
      roadmap: [
        {
          id: "m1",
          title: "MVP validado",
          type: "milestone",
          status: "planned",
          confidence: 80,
          linkedBoardIds: ["b_1"],
        },
      ],
      ai: {
        guardrails: ["Nao inventar numeros."],
        analysisPreferences: ["Foco em risco de prazo."],
      },
    });

    expect(parsed.deliveryModel).toBe("safe");
    expect(parsed.financials?.costModel).toBe("value_stream");
    expect(parsed.roadmap?.[0]?.type).toBe("milestone");
    expect(parsed.ai?.guardrails?.[0]).toContain("Nao inventar");
  });

  it("supports partial project updates and board links", () => {
    expect(ProjectUpdateSchema.parse({ progressPct: 55 }).progressPct).toBe(55);
    expect(ProjectBoardLinkSchema.parse({ boardId: "b_1" }).boardId).toBe("b_1");
  });

  it("keeps project AI prompt bounded", () => {
    expect(ProjectAiBodySchema.safeParse({ message: "Qual risco ameaca o roadmap?" }).success).toBe(true);
    expect(ProjectAiBodySchema.safeParse({ message: "x" }).success).toBe(false);
  });

  it("defines plan gates for advanced project modules", () => {
    expect(PLAN_FEATURE_MATRIX.project_governance).toContain("pro");
    expect(PLAN_FEATURE_MATRIX.project_roadmap).toContain("pro");
    expect(PLAN_FEATURE_MATRIX.project_financials).toEqual(["business"]);
    expect(PLAN_FEATURE_MATRIX.project_ai).toEqual(["business"]);
  });
});
