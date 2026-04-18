import { describe, expect, it } from "vitest";
import { BPMN_NODE_TYPES } from "./bpmn-types";
import { BPMN_VISUAL_SPEC, BPMN_VISUAL_STATE_TOKENS, BPMN_VISUAL_TOKENS, getBpmnVisualSpec } from "./bpmn-visual-system";

describe("bpmn visual system", () => {
  it("covers every supported BPMN node type", () => {
    const supported = new Set(BPMN_VISUAL_SPEC.map((entry) => entry.type));
    for (const type of BPMN_NODE_TYPES) {
      expect(supported.has(type)).toBe(true);
    }
  });

  it("returns fallback spec for unknown node type", () => {
    const spec = getBpmnVisualSpec("unknown_node_type");
    expect(spec.type).toBe("generic_task");
  });

  it("defines stable state tokens for all required states", () => {
    expect(Object.keys(BPMN_VISUAL_STATE_TOKENS).sort()).toEqual([
      "connected",
      "default",
      "disabled",
      "dragging",
      "hover",
      "invalid",
      "selected",
    ]);
  });

  it("keeps minimum readability constraints", () => {
    expect(BPMN_VISUAL_TOKENS.minReadableZoom).toBeGreaterThanOrEqual(0.35);
    expect(BPMN_VISUAL_TOKENS.minContrastRatio).toBeGreaterThanOrEqual(4.5);
  });
});
